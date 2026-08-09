import { getPaths } from "../../config.js";
import fs from "fs";
import path from "path";
import { statDirent, fileSignature } from "./fsUtils.js";
import { ADDON_DIRS } from "./assetServer.js";

const { addonsDirectory } = getPaths();

function loadFilesFromDirectory(directory, extension, callback) {
	return new Promise((resolve) => {
		fs.readdir(directory, { withFileTypes: true }, (err, entries) => {
			if (err) {
				if (err.code !== "ENOENT") {
					console.warn(
						`[Addons] Cannot read directory '${directory}':`,
						err.message,
					);
				}
				return resolve();
			}

			const pending = [];

			for (const entry of entries) {
				const info = statDirent(directory, entry);

				if (!info) {
					console.warn(
						`[Addons] Broken symlink or inaccessible: ${path.join(directory, entry.name)}`,
					);
					continue;
				}

				const fullPath = info.fullPath;

				if (info.isDirectory) {
					if (entry.name.startsWith("!")) continue;

					if (
						directory === addonsDirectory &&
						!ADDON_DIRS.has(entry.name)
					) {
						ADDON_DIRS.set(entry.name, fullPath);
						console.log(
							`[Assets] Pre-registered addon: ${entry.name} → ${fullPath}`,
						);
					}

					if (entry.name === "assets") {
						const addonName = path.basename(directory);

						if (!ADDON_DIRS.has(addonName)) {
							ADDON_DIRS.set(addonName, directory);
							console.log(
								`[Assets] Registered addon: ${addonName} → ${directory}`,
							);
						}
						continue;
					}

					pending.push(
						loadFilesFromDirectory(fullPath, extension, callback),
					);
					continue;
				}

				if (info.isFile && path.extname(entry.name) === extension) {
					const p = new Promise((res2) => {
						fs.readFile(fullPath, "utf8", (readErr, content) => {
							if (readErr) {
								console.warn(
									`[Addons] Cannot read file '${fullPath}':`,
									readErr.message,
								);
							} else {
								try {
									callback(content, fullPath);
								} catch (cbErr) {
									console.error(
										`[Addons] Callback error for '${fullPath}':`,
										cbErr,
									);
								}
							}
							res2();
						});
					});
					pending.push(p);
				}
			}

			Promise.all(pending).then(resolve);
		});
	});
}

function relativeAddonPath(filePath) {
	return path.relative(addonsDirectory, filePath).replace(/\\/g, "/");
}

function scanAddonCssFiles(directory = addonsDirectory, result = new Map()) {
	let entries;

	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.warn(
				`[Addons] Cannot scan CSS directory '${directory}':`,
				err.message,
			);
		}
		return result;
	}

	for (const entry of entries) {
		const info = statDirent(directory, entry);

		if (!info) {
			console.warn(
				`[Addons] Broken symlink or inaccessible: ${path.join(directory, entry.name)}`,
			);
			continue;
		}

		if (info.isDirectory) {
			if (entry.name.startsWith("!")) continue;
			if (entry.name === "assets") continue;

			scanAddonCssFiles(info.fullPath, result);
			continue;
		}

		if (info.isFile && path.extname(entry.name) === ".css") {
			try {
				const content = fs.readFileSync(info.fullPath, "utf8");
				const stat = fs.statSync(info.fullPath);
				result.set(info.fullPath, {
					content,
					label: relativeAddonPath(info.fullPath),
					signature: fileSignature(stat),
				});
			} catch (err) {
				console.warn(
					`[Addons] Cannot read CSS file '${info.fullPath}':`,
					err.message,
				);
			}
		}
	}

	return result;
}

function scanAddonCssMeta(directory = addonsDirectory, result = new Map()) {
	let entries;

	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (err) {
		if (err.code !== "ENOENT") {
			console.warn(
				`[Addons] Cannot scan CSS directory '${directory}':`,
				err.message,
			);
		}
		return result;
	}

	for (const entry of entries) {
		const info = statDirent(directory, entry);
		if (!info) continue;

		if (info.isDirectory) {
			if (entry.name.startsWith("!")) continue;
			if (entry.name === "assets") continue;

			scanAddonCssMeta(info.fullPath, result);
			continue;
		}

		if (info.isFile && path.extname(entry.name) === ".css") {
			try {
				const stat = fs.statSync(info.fullPath);
				result.set(info.fullPath, {
					signature: fileSignature(stat),
					label: relativeAddonPath(info.fullPath),
				});
			} catch {}
		}
	}

	return result;
}

function scanAddonCssDirectories(
	directory = addonsDirectory,
	result = new Set(),
) {
	let entries;

	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch {
		return result;
	}

	result.add(directory);

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith("!")) continue;
		if (entry.name === "assets") continue;

		scanAddonCssDirectories(path.join(directory, entry.name), result);
	}

	return result;
}

export {
	loadFilesFromDirectory,
	relativeAddonPath,
	scanAddonCssFiles,
	scanAddonCssMeta,
	scanAddonCssDirectories,
};
