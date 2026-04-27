import { getPaths } from "../config.js";
import { getConfig } from "./configManager.js";
import fs from "fs";
import path from "path";

function isAddonDirectory(addonsDirectory, entry) {
	if (entry.isDirectory()) return true;
	if (!entry.isSymbolicLink()) return false;

	try {
		return fs.statSync(path.join(addonsDirectory, entry.name)).isDirectory();
	} catch {
		return false;
	}
}

function parseOverrideFile(content) {
	const result = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//"))
			continue;
		const match = trimmed.match(/^(\w+)\s*=\s*"(on|default|unset)"$/);
		if (match) result[match[1]] = match[2];
	}
	return result;
}

export function getAddonExperimentOverrides() {
	const cfg = getConfig();
	if (!cfg.programSettings?.addons?.enable) return [];

	const { addonsDirectory } = getPaths();
	if (!fs.existsSync(addonsDirectory)) return [];

	let entries;
	try {
		entries = fs.readdirSync(addonsDirectory, { withFileTypes: true });
	} catch {
		return [];
	}

	const overrides = [];

	for (const entry of entries) {
		if (!isAddonDirectory(addonsDirectory, entry)) continue;
		if (entry.name.startsWith("!")) continue;

		const overrideFile = path.join(
			addonsDirectory,
			entry.name,
			"experiments.override",
		);
		if (!fs.existsSync(overrideFile)) continue;

		try {
			const content = fs.readFileSync(overrideFile, "utf-8");
			const experiments = parseOverrideFile(content);
			if (Object.keys(experiments).length > 0) {
				overrides.push({ addonName: entry.name, experiments });
			}
		} catch {
			console.warn(`[AddonExperiments] Could not read ${overrideFile}`);
		}
	}

	return overrides;
}

export function mergeAddonExperiments(userExperiments) {
	const overrides = getAddonExperimentOverrides();
	const merged = { ...userExperiments };
	for (const { experiments } of overrides) {
		Object.assign(merged, experiments);
	}
	return merged;
}
