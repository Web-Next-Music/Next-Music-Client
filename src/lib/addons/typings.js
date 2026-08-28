import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPaths } from "../../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TYPES_SOURCE_DIRS = [
	path.join(__dirname, "..", "..", "assets", "addon-types"),
	path.join(process.resourcesPath ?? "", "addon-types"),
];

function resolveTypesSource(fileName) {
	for (const directory of TYPES_SOURCE_DIRS) {
		const candidate = path.join(directory, fileName);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

const { addonsDirectory } = getPaths();

const TYPINGS_FILE = "nextmusic.d.ts";
const TSCONFIG_FILE = "tsconfig.json";

function copyIfSource(fileName, { overwrite }) {
	const source = resolveTypesSource(fileName);
	const target = path.join(addonsDirectory, fileName);

	if (!source) {
		console.warn(`[Addons] Typings source missing: ${fileName}`);
		return;
	}

	if (!overwrite && fs.existsSync(target)) return;

	try {
		fs.copyFileSync(source, target);
	} catch (err) {
		console.warn(
			`[Addons] Cannot write '${fileName}' to addons directory:`,
			err.message,
		);
	}
}

function syncAddonTypings() {
	try {
		fs.mkdirSync(addonsDirectory, { recursive: true });
	} catch (err) {
		console.warn("[Addons] Cannot create addons directory:", err.message);
		return;
	}

	copyIfSource(TYPINGS_FILE, { overwrite: true });
	copyIfSource(TSCONFIG_FILE, { overwrite: false });
}

export { syncAddonTypings };
