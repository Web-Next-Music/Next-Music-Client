import fs from "fs";
import path from "path";

function safeDecodeURI(str) {
	if (!str) return null;
	try {
		return decodeURIComponent(str.replace(/\+/g, " "));
	} catch {
		return null;
	}
}

function safeResolve(root, ...segments) {
	const resolved = path.resolve(root, ...segments);

	if (!resolved.startsWith(root + path.sep) && resolved !== root) {
		return null;
	}

	return resolved;
}

function statDirent(dir, entry) {
	const fullPath = path.join(dir, entry.name);

	if (!entry.isSymbolicLink()) {
		return {
			fullPath,
			isDirectory: entry.isDirectory(),
			isFile: entry.isFile(),
		};
	}

	try {
		const stat = fs.statSync(fullPath);
		return {
			fullPath,
			isDirectory: stat.isDirectory(),
			isFile: stat.isFile(),
		};
	} catch {
		return null;
	}
}

function fileSignature(stat) {
	return `${stat.mtimeMs}:${stat.size}`;
}

function findAssetsDir(dir) {
	if (!fs.existsSync(dir)) return null;
	const queue = [dir];

	while (queue.length) {
		const current = queue.shift();
		let entries;

		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const info = statDirent(current, entry);
			if (!info || !info.isDirectory) continue;

			if (entry.name === "assets") return info.fullPath;
			queue.push(info.fullPath);
		}
	}
	return null;
}

function findFileRecursive(dir, fileName) {
	let entries;

	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}

	for (const entry of entries) {
		const info = statDirent(dir, entry);
		if (!info) continue;

		if (info.isFile && entry.name === fileName) return info.fullPath;
		if (info.isDirectory) {
			const found = findFileRecursive(info.fullPath, fileName);
			if (found) return found;
		}
	}
	return null;
}

function findHandleFile(addonDir) {
	if (!fs.existsSync(addonDir)) return null;
	const queue = [addonDir];

	while (queue.length) {
		const current = queue.shift();

		let entries;

		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const info = statDirent(current, entry);
			if (!info || !info.isDirectory) continue;

			if (entry.name === "assets") {
				const candidate = path.join(current, "handleEvents.json");
				if (fs.existsSync(candidate)) return candidate;
			}
			queue.push(info.fullPath);
		}
	}

	return findFileRecursive(addonDir, "handleEvents.json");
}

export {
	safeDecodeURI,
	safeResolve,
	statDirent,
	fileSignature,
	findAssetsDir,
	findFileRecursive,
	findHandleFile,
};
