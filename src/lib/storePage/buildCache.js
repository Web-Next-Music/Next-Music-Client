import fs from "fs";
import path from "path";
import { getPaths } from "../../config.js";

function cachePath() {
	return path.join(getPaths().addonsDirectory, ".build-cache.json");
}

function load() {
	try {
		return JSON.parse(fs.readFileSync(cachePath(), "utf8"));
	} catch {
		return {};
	}
}

function save(data) {
	try {
		fs.writeFileSync(cachePath(), JSON.stringify(data, null, 2), "utf8");
	} catch {}
}

export function getBuildCache(key) {
	const data = load();
	return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
}

export function setBuildCache(key, hasRelease) {
	const data = load();
	data[key] = hasRelease;
	save(data);
}
