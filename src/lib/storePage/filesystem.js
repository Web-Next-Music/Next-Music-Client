import fs from "fs";
import path from "path";
import { getPaths } from "../../config.js";

const { addonsDirectory } = getPaths();

export { addonsDirectory };

const DIR_TTL = 1000;
let dirCache = null;
let dirCacheAt = 0;

function isInternalEntry(name) {
	return name.replace(/^!/, "").startsWith(".");
}

function readAddonsDir() {
	if (dirCache && Date.now() - dirCacheAt < DIR_TTL) return dirCache;

	try {
		dirCache = fs
			.readdirSync(addonsDirectory)
			.filter((n) => !isInternalEntry(n));
	} catch {
		dirCache = [];
	}

	dirCacheAt = Date.now();
	return dirCache;
}

export function invalidateAddonsDir() {
	dirCache = null;
}

export function validAddonName(name) {
	return (
		typeof name === "string" &&
		name.length > 0 &&
		name.length <= 200 &&
		!name.startsWith(".") &&
		!name.startsWith("!") &&
		!/[/\\\x00-\x1f<>:"|?*]/.test(name) &&
		!/[. ]$/.test(name) &&
		!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
	);
}

export function localAddonFile(name, file) {
	const raw = findRawEntry(name);
	if (
		!raw ||
		typeof file !== "string" ||
		!file ||
		path.isAbsolute(file) ||
		path.win32.isAbsolute(file) ||
		file.includes("\\") ||
		file.split("/").some((part) => !part || part === "." || part === "..")
	) {
		throw new Error("Invalid local path");
	}
	let target = path.join(addonsDirectory, raw);
	if (!fs.lstatSync(target).isDirectory())
		throw new Error("Invalid addon path");
	for (const part of file.split("/")) {
		target = path.join(target, part);
		if (fs.lstatSync(target).isSymbolicLink())
			throw new Error("Symbolic links are not allowed");
	}
	if (!fs.lstatSync(target).isFile()) throw new Error("Invalid local file");
	return target;
}

export function findRawEntry(name) {
	if (typeof name === "string" && name.startsWith("!")) name = name.slice(1);
	if (!validAddonName(name)) return null;
	const needle = name.toLowerCase();
	return (
		readAddonsDir().find((n) => n.replace(/^!/, "").toLowerCase() === needle) ||
		null
	);
}

export function getLocalReleaseTag(addonName) {
	try {
		const raw = findRawEntry(addonName);
		if (!raw) return null;

		const tagFile = localAddonFile(raw, ".git-release");
		if (fs.existsSync(tagFile)) return fs.readFileSync(tagFile, "utf8").trim();

		return null;
	} catch {
		return null;
	}
}

export function getLocalCommitHash(addonName) {
	try {
		const raw = findRawEntry(addonName);
		if (!raw) return null;

		const headFile = path.join(addonsDirectory, raw, ".git", "HEAD");

		if (!fs.existsSync(headFile)) {
			const commitFile = path.join(addonsDirectory, raw, ".git-commit");

			if (fs.existsSync(commitFile))
				return fs
					.readFileSync(localAddonFile(raw, ".git-commit"), "utf8")
					.trim();
			return null;
		}

		const head = fs
			.readFileSync(localAddonFile(raw, ".git/HEAD"), "utf8")
			.trim();
		if (!head.startsWith("ref:")) return head.length >= 40 ? head : null;

		const refPath = head.slice(5).trim();
		if (
			!/^refs\/[A-Za-z0-9._/-]+$/.test(refPath) ||
			refPath.split("/").includes("..")
		)
			return null;

		const refFile = path.join(
			addonsDirectory,
			raw,
			".git",
			...refPath.split("/"),
		);

		if (fs.existsSync(refFile))
			return fs
				.readFileSync(localAddonFile(raw, ".git/" + refPath), "utf8")
				.trim();

		const packedRefs = path.join(addonsDirectory, raw, ".git", "packed-refs");
		if (fs.existsSync(packedRefs)) {
			const lines = fs
				.readFileSync(localAddonFile(raw, ".git/packed-refs"), "utf8")
				.split("\n");
			for (const line of lines) {
				if (line.endsWith(refPath)) return line.split(" ")[0].trim();
			}
		}

		return null;
	} catch {
		return null;
	}
}

export function installedEntries() {
	return readAddonsDir().map((n) => ({
		name: n.replace(/^!/, "").toLowerCase(),
		enabled: !n.startsWith("!"),
	}));
}

export function findEntry(name) {
	return findRawEntry(name);
}

export function fsToggle(name) {
	const found = findEntry(name);

	if (!found) throw new Error("Not found: " + name);

	const disabled = found.startsWith("!");
	const target = path.join(
		addonsDirectory,
		disabled ? found.slice(1) : "!" + found,
	);
	try {
		fs.lstatSync(target);
		throw new Error("Target addon already exists");
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	fs.renameSync(path.join(addonsDirectory, found), target);

	invalidateAddonsDir();

	return disabled;
}

export function fsDelete(name) {
	const found = findEntry(name);
	console.log(
		"[Addons] Deleting:",
		JSON.stringify(name),
		"->",
		JSON.stringify(found),
	);
	if (found)
		fs.rmSync(path.join(addonsDirectory, found), {
			recursive: true,
			force: true,
		});

	invalidateAddonsDir();
}

export function getCustomEntries(knownNames) {
	try {
		const knownSet = new Set(knownNames.map((n) => n.toLowerCase()));
		return readAddonsDir()
			.filter((n) => !knownSet.has(n.replace(/^!/, "").toLowerCase()))
			.map((n) => {
				const clean = n.replace(/^!/, "");
				const enabled = !n.startsWith("!");
				const fullPath = path.join(addonsDirectory, n);
				const isDir = fs.lstatSync(fullPath).isDirectory();
				let logo = null,
					readme = null;

				if (isDir) {
					const files = fs.readdirSync(fullPath);
					const isImgFile = (f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f);

					function pickImgFile(list) {
						return (
							list.find(
								(f) => /^(image|icon|logo|preview)\./i.test(f) && isImgFile(f),
							) ||
							list.find((f) => isImgFile(f)) ||
							null
						);
					}

					function findBrandingDir(dirPath, depth = 0) {
						if (depth > 3) return null;
						try {
							const items = fs.readdirSync(dirPath);
							const found = items.find((item) => {
								try {
									return (
										/^_branding$/i.test(item) &&
										fs.lstatSync(path.join(dirPath, item)).isDirectory()
									);
								} catch {
									return false;
								}
							});

							if (found) return path.join(dirPath, found);

							for (const item of items) {
								try {
									const itemPath = path.join(dirPath, item);
									if (fs.lstatSync(itemPath).isDirectory()) {
										const r = findBrandingDir(itemPath, depth + 1);
										if (r) return r;
									}
								} catch {}
							}
						} catch {}
						return null;
					}

					function findLogoInDir(dirPath, depth = 0) {
						if (depth > 5) return null;
						try {
							const items = fs.readdirSync(dirPath);
							const img = pickImgFile(items);
							if (img) return path.join(dirPath, img);
							for (const item of items) {
								try {
									const itemPath = path.join(dirPath, item);
									if (fs.lstatSync(itemPath).isDirectory()) {
										const r = findLogoInDir(itemPath, depth + 1);
										if (r) return r;
									}
								} catch {}
							}
						} catch {}
						return null;
					}

					const rootImg = pickImgFile(files);

					if (rootImg)
						logo = `/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rootImg)}`;

					if (!logo) {
						const brandingPath = findBrandingDir(fullPath);

						if (brandingPath) {
							const logoAbs = findLogoInDir(brandingPath);

							if (logoAbs)
								logo = `/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.relative(fullPath, logoAbs).split(path.sep).join("/"))}`;
						}
					}

					if (!logo) {
						for (const sub of files) {
							try {
								const subPath = path.join(fullPath, sub);
								if (!fs.lstatSync(subPath).isDirectory()) continue;

								const subFiles = fs.readdirSync(subPath);
								if (subFiles.some((f) => /\.(css|js|json)$/i.test(f))) {
									const found = pickImgFile(subFiles);
									if (found) {
										logo = `/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(`${sub}/${found}`)}`;
										break;
									}
								}
							} catch {}
						}
					}

					const rmFile = files.find((f) => /^readme\.md$/i.test(f));
					if (rmFile)
						readme = `/api/local-readme?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rmFile)}`;
				}

				return { name: clean, raw: n, enabled, isDir, logo, readme };
			});
	} catch {
		return [];
	}
}
