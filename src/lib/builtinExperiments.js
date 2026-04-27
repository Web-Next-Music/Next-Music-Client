import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUILTIN_EXPERIMENTS_PATH = path.resolve(
	__dirname,
	"..",
	"data",
	"experiments.json",
);

let cachedExperiments = null;

function normalizeExperiments(raw) {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return {};
	}

	const result = {};

	for (const [name, value] of Object.entries(raw)) {
		if (
			typeof name === "string" &&
			(value === "on" || value === "default" || value === "unset")
		) {
			result[name] = value;
		}
	}

	return result;
}

export function getBuiltinExperiments() {
	if (cachedExperiments) return { ...cachedExperiments };

	try {
		const raw = fs.readFileSync(BUILTIN_EXPERIMENTS_PATH, "utf-8");
		cachedExperiments = normalizeExperiments(JSON.parse(raw));
	} catch {
		cachedExperiments = {};
	}

	return { ...cachedExperiments };
}

export function resolveBuiltinExperiments(userExperiments = {}) {
	const resolved = getBuiltinExperiments();

	if (
		!userExperiments ||
		typeof userExperiments !== "object" ||
		Array.isArray(userExperiments)
	) {
		return resolved;
	}

	for (const [name, value] of Object.entries(userExperiments)) {
		if (
			value === "unset" &&
			Object.prototype.hasOwnProperty.call(resolved, name)
		) {
			continue;
		}

		resolved[name] = value;
	}

	return resolved;
}

export function getBuiltinExperimentState(name, userExperiments = {}) {
	return resolveBuiltinExperiments(userExperiments)[name];
}
