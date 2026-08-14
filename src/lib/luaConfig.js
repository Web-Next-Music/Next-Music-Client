const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function escapeLuaString(str) {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

function serializeValue(value, indent) {
	if (value === null || value === undefined) return "nil";

	const type = typeof value;

	if (type === "boolean") return value ? "true" : "false";

	if (type === "number") {
		if (!Number.isFinite(value)) return "nil";
		return String(value);
	}

	if (type === "string") return `"${escapeLuaString(value)}"`;

	if (Array.isArray(value)) {
		if (value.length === 0) return "{}";

		const pad = "\t".repeat(indent + 1);
		const lines = value.map(
			(item) => `${pad}${serializeValue(item, indent + 1)},`,
		);

		return `{\n${lines.join("\n")}\n${"\t".repeat(indent)}}`;
	}

	if (type === "object") {
		const keys = Object.keys(value);
		if (keys.length === 0) return "{}";

		const pad = "\t".repeat(indent + 1);
		const lines = keys.map((key) => {
			const left = IDENT_RE.test(key)
				? key
				: `["${escapeLuaString(key)}"]`;

			return `${pad}${left} = ${serializeValue(value[key], indent + 1)},`;
		});

		return `{\n${lines.join("\n")}\n${"\t".repeat(indent)}}`;
	}

	return "nil";
}

export function stringifyLuaConfig(config, secrets) {
	return [
		"local nm = {}",
		"",
		`nm.config = ${serializeValue(config, 0)}`,
		"",
		`nm.secrets = ${serializeValue(secrets, 0)}`,
		"",
		"return nm",
		"",
	].join("\n");
}

class LuaReader {
	constructor(text) {
		this.text = text;
		this.pos = 0;
	}

	skip() {
		while (this.pos < this.text.length) {
			const char = this.text[this.pos];

			if (
				char === " " ||
				char === "\t" ||
				char === "\n" ||
				char === "\r"
			) {
				this.pos++;
				continue;
			}

			if (this.text.startsWith("--[[", this.pos)) {
				const end = this.text.indexOf("]]", this.pos + 4);
				this.pos = end === -1 ? this.text.length : end + 2;
				continue;
			}

			if (this.text.startsWith("--", this.pos)) {
				const end = this.text.indexOf("\n", this.pos);
				this.pos = end === -1 ? this.text.length : end;
				continue;
			}

			break;
		}
	}

	expect(char) {
		this.skip();
		if (this.text[this.pos] !== char)
			throw new Error(
				`Expected "${char}" at position ${this.pos} in Lua config`,
			);
		this.pos++;
	}

	readString() {
		const quote = this.text[this.pos];
		this.pos++;

		let result = "";

		while (this.pos < this.text.length) {
			const char = this.text[this.pos];

			if (char === "\\") {
				const next = this.text[this.pos + 1];
				const map = { n: "\n", r: "\r", t: "\t" };
				result += map[next] ?? next;
				this.pos += 2;
				continue;
			}

			if (char === quote) {
				this.pos++;
				return result;
			}

			result += char;
			this.pos++;
		}

		throw new Error("Unterminated string in Lua config");
	}

	readValue() {
		this.skip();

		const char = this.text[this.pos];

		if (char === '"' || char === "'") return this.readString();
		if (char === "{") return this.readTable();

		if (this.text.startsWith("true", this.pos)) {
			this.pos += 4;
			return true;
		}

		if (this.text.startsWith("false", this.pos)) {
			this.pos += 5;
			return false;
		}

		if (this.text.startsWith("nil", this.pos)) {
			this.pos += 3;
			return null;
		}

		const match = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(
			this.text.slice(this.pos),
		);

		if (match) {
			this.pos += match[0].length;
			return Number(match[0]);
		}

		throw new Error(
			`Unexpected value at position ${this.pos} in Lua config`,
		);
	}

	readTable() {
		this.expect("{");

		const map = {};
		const list = [];
		let hasKeys = false;

		for (;;) {
			this.skip();

			if (this.text[this.pos] === "}") {
				this.pos++;
				break;
			}

			let key = null;

			if (this.text[this.pos] === "[") {
				this.pos++;
				key = this.readValue();
				this.expect("]");
				this.expect("=");
			} else {
				const identMatch = /^[A-Za-z_][A-Za-z0-9_]*\s*=(?!=)/.exec(
					this.text.slice(this.pos),
				);

				if (identMatch) {
					key = identMatch[0].split("=")[0].trim();
					this.pos += identMatch[0].length;
				}
			}

			const value = this.readValue();

			if (key === null) {
				list.push(value);
			} else {
				hasKeys = true;
				map[String(key)] = value;
			}

			this.skip();

			const separator = this.text[this.pos];
			if (separator === "," || separator === ";") this.pos++;
		}

		if (hasKeys) {
			list.forEach((item, index) => {
				map[String(index + 1)] = item;
			});

			return map;
		}

		return list;
	}
}

function readAssignment(text, name) {
	const re = new RegExp(`(?:^|\\n)\\s*(?:local\\s+)?${name}\\s*=`, "m");
	const match = re.exec(text);
	if (!match) return null;

	const reader = new LuaReader(text);
	reader.pos = match.index + match[0].length;

	return reader.readValue();
}

export function parseLuaConfig(text) {
	const config = readAssignment(text, "nm\\.config");
	const secrets = readAssignment(text, "nm\\.secrets");

	return {
		config: config && typeof config === "object" ? config : {},
		secrets: secrets && typeof secrets === "object" ? secrets : {},
	};
}
