import fs from "fs";
import path from "path";

/**
 * Recursively finds handleEvents.json inside a directory.
 * Checks files at the current level first, then recurses into subdirectories.
 * Returns the full path if found, or null.
 */
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
    } catch {
        // skip unreadable dirs
    }
    return null;
}

/**
 * Merges old handleEvents values into the new handleEvents structure.
 *
 * Rules (applied recursively):
 *
 *   Plain objects:
 *     - Key in BOTH, both plain objects  → recurse
 *     - Key in BOTH, same primitive type → old value
 *     - Key in BOTH, type mismatch       → new value
 *     - Key only in NEW                  → new value (keep as-is)
 *     - Key only in OLD                  → dropped
 *
 *   Arrays — matched by index:
 *     - Index exists in BOTH             → recurse (merge element pair)
 *     - Index only in NEW                → new element kept as-is
 *     - Index only in OLD                → dropped (new array is shorter)
 */
export function mergeHandleEvents(oldData, newData) {
    // Scalar / null on either side
    if (
        typeof newData !== "object" ||
        newData === null ||
        typeof oldData !== "object" ||
        oldData === null
    ) {
        // Same type → old value; type mismatch → new value
        return typeof oldData === typeof newData ? oldData : newData;
    }

    // Arrays — merge by index
    if (Array.isArray(newData)) {
        if (!Array.isArray(oldData)) return newData; // old wasn't array → use new
        return newData.map((newEl, i) => {
            if (i >= oldData.length) return newEl; // index only in new → keep
            return mergeHandleEvents(oldData[i], newEl); // both have index → recurse
            // indices only in old are dropped (map stops at newData.length)
        });
    }

    if (Array.isArray(oldData)) return newData; // new is object, old was array → use new

    // Both plain objects — iterate over newData keys only
    const result = {};
    for (const key of Object.keys(newData)) {
        const newVal = newData[key];

        if (!Object.prototype.hasOwnProperty.call(oldData, key)) {
            result[key] = newVal; // only in new → keep as-is
            continue;
        }

        const oldVal = oldData[key];
        const newIsPlainObj =
            typeof newVal === "object" &&
            newVal !== null &&
            !Array.isArray(newVal);
        const oldIsPlainObj =
            typeof oldVal === "object" &&
            oldVal !== null &&
            !Array.isArray(oldVal);

        if (newIsPlainObj && oldIsPlainObj) {
            result[key] = mergeHandleEvents(oldVal, newVal); // both objects → recurse
        } else if (Array.isArray(newVal) && Array.isArray(oldVal)) {
            result[key] = mergeHandleEvents(oldVal, newVal); // both arrays → recurse
        } else if (typeof oldVal === typeof newVal && !Array.isArray(newVal)) {
            result[key] = oldVal; // same primitive type → old (user) value
        } else {
            result[key] = newVal; // type mismatch → new value
        }
        // Keys only in oldData are never visited → automatically dropped
    }
    return result;
}

/**
 * Reads and parses handleEvents.json from addonDir (searched recursively).
 * Returns the parsed object, or null if not found / unparseable.
 */
export function readOldHandleEvents(addonDir) {
    const filePath = findHandleEventsFile(addonDir);
    if (!filePath) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return null;
    }
}

/**
 * After an update has been written to addonDir, finds the new handleEvents.json
 * (searched recursively), merges preserved old values into it, and writes back.
 * Safe to call even when no handleEvents.json exists in either version.
 */
export function applyHandleEventsMerge(addonDir, oldData) {
    if (!oldData) return;
    const newFilePath = findHandleEventsFile(addonDir);
    if (!newFilePath) return;
    try {
        const newData = JSON.parse(fs.readFileSync(newFilePath, "utf8"));
        const merged = mergeHandleEvents(oldData, newData);
        fs.writeFileSync(newFilePath, JSON.stringify(merged, null, 2), "utf8");
    } catch {
        // If anything goes wrong, leave the freshly installed file untouched
    }
}
