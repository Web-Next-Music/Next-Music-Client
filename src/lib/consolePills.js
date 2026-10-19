export function installConsolePills(terminal = false) {
	const marker = Symbol.for("nextmusic.consolePills");
	if (console[marker]) return;
	Object.defineProperty(console, marker, { value: true });

	const colors = [
		["#67e8f9", 117],
		["#c4b5fd", 183],
		["#86efac", 120],
		["#fcd34d", 222],
		["#f9a8d4", 218],
		["#fdba74", 215],
		["#93c5fd", 153],
	];
	const colorFor = (tag) => {
		let hash = 0;
		for (const character of tag) {
			hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
		}
		return colors[hash % colors.length];
	};

	for (const method of ["log", "info", "warn", "error", "debug", "trace"]) {
		const original = console[method].bind(console);
		console[method] = (...args) => {
			if (typeof args[0] !== "string") return original(...args);
			const match = args[0].match(/^(\s*(?:\[[^\]\r\n]+\]\s*)+)/);
			if (!match) return original(...args);

			const styles = [];
			const prefix = match[0].replace(/\[([^\]\r\n]+)\]/g, (_, tag) => {
				const [background, ansi] = colorFor(tag);
				if (terminal) {
					return `\u001b[48;5;${ansi}m\u001b[38;5;16m ${tag} \u001b[0m`;
				}
				styles.push(
					`background:${background};color:#111827;border-radius:999px;padding:1px 7px;font-weight:700;`,
					"",
				);
				return `%c ${tag.replace(/%/g, "%%")} %c`;
			});
			return original(
				prefix + args[0].slice(match[0].length),
				...styles,
				...args.slice(1),
			);
		};
	}
}
