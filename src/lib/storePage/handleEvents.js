import fs from "fs";
import path from "path";

export function findHandleEventsFile(dir) {
	if (!fs.existsSync(dir)) return null;
	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isFile() && entry.name === "handleEvents.json")
				return path.join(dir, entry.name);
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const found = findHandleEventsFile(path.join(dir, entry.name));
				if (found) return found;
			}
		}
	} catch {}
	return null;
}

export function mergeHandleEvents(oldData, newData) {
	if (
		typeof newData !== "object" ||
		newData === null ||
		typeof oldData !== "object" ||
		oldData === null
	) {
		return typeof oldData === typeof newData ? oldData : newData;
	}

	if (Array.isArray(newData)) {
		if (!Array.isArray(oldData)) return newData;
		return newData.map((newEl, i) => {
			if (i >= oldData.length) return newEl;
			return mergeHandleEvents(oldData[i], newEl);
		});
	}

	if (Array.isArray(oldData)) return newData;

	const result = {};

	for (const key of Object.keys(newData)) {
		const newVal = newData[key];

		if (!Object.prototype.hasOwnProperty.call(oldData, key)) {
			result[key] = newVal;
			continue;
		}

		const oldVal = oldData[key];
		const newIsPlainObj =
			typeof newVal === "object" && newVal !== null && !Array.isArray(newVal);
		const oldIsPlainObj =
			typeof oldVal === "object" && oldVal !== null && !Array.isArray(oldVal);

		if (newIsPlainObj && oldIsPlainObj) {
			result[key] = mergeHandleEvents(oldVal, newVal);
		} else if (Array.isArray(newVal) && Array.isArray(oldVal)) {
			result[key] = mergeHandleEvents(oldVal, newVal);
		} else if (typeof oldVal === typeof newVal && !Array.isArray(newVal)) {
			result[key] = oldVal;
		} else {
			result[key] = newVal;
		}
	}
	return result;
}

export function readOldHandleEvents(addonDir) {
	const filePath = findHandleEventsFile(addonDir);
	if (!filePath) return null;

	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

export function applyHandleEventsMerge(addonDir, oldData) {
	if (!oldData) return;
	const newFilePath = findHandleEventsFile(addonDir);
	if (!newFilePath) return;

	try {
		const newData = JSON.parse(fs.readFileSync(newFilePath, "utf8"));
		const merged = mergeHandleEvents(oldData, newData);
		fs.writeFileSync(newFilePath, JSON.stringify(merged, null, 2), "utf8");
	} catch {}
}
