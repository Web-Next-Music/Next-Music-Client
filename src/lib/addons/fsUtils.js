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

function enterDirectory(directory, ancestors) {
	try {
		const realPath = fs.realpathSync(directory);
		if (ancestors.has(realPath)) return null;
		return new Set([...ancestors, realPath]);
	} catch {
		return null;
	}
}

function fileSignature(stat) {
	return `${stat.mtimeMs}:${stat.size}`;
}

export {
	safeDecodeURI,
	safeResolve,
	statDirent,
	enterDirectory,
	fileSignature,
};
