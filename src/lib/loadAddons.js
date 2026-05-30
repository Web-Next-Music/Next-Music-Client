import { loadConfig, getPaths } from "../config.js";
import fs from "fs";
import path from "path";
import http from "http";

const { addonsDirectory } = getPaths();
const config = loadConfig();

const ADDON_DIRS = new Map();
let serverStarted = false;
let assetServerPort = 2007;
let activeAddonsWindow = null;
let cssWatcherStarted = false;
let cssRescanTimer = null;
let cssPollingTimer = null;
let cssRescanInProgress = false;
const cssWatchers = new Map();
const addonCssCache = new Map();
const pendingCssRemovals = new Map();
const CSS_RESCAN_DELAY_MS = 100;
const CSS_POLL_INTERVAL_MS = 1000;
const CSS_REMOVAL_GRACE_MS = 2500;

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
			const fullPath = path.join(current, entry.name);

			try {
				// Follow symlinks
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					if (entry.name === "assets") return fullPath;
					queue.push(fullPath);
				}
			} catch {}
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
		const fullPath = path.join(dir, entry.name);

		try {
			const stat = fs.statSync(fullPath);
			if (stat.isFile() && entry.name === fileName) return fullPath;
			if (stat.isDirectory()) {
				const found = findFileRecursive(fullPath, fileName);
				if (found) return found;
			}
		} catch {}
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
			const fullPath = path.join(current, entry.name);

			try {
				const stat = fs.statSync(fullPath);
				if (stat.isDirectory()) {
					if (entry.name === "assets") {
						const candidate = path.join(current, "handleEvents.json");
						if (fs.existsSync(candidate)) return candidate;
					}
					queue.push(fullPath);
				}
			} catch {}
		}
	}

	return findFileRecursive(addonDir, "handleEvents.json");
}

function startAssetServer(port = 2007) {
	if (serverStarted) return Promise.resolve(assetServerPort);

	return new Promise((resolve) => {

	const server = http.createServer((req, res) => {
		function send(status, body, headers = {}) {
			res.writeHead(status, { "Content-Type": "text/plain", ...headers });
			res.end(body);
		}

		let parsed;

		try {
			parsed = new URL(req.url, `http://127.0.0.1:${assetServerPort}`);
		} catch {
			return send(400, "Bad URL");
		}

		const pathname = parsed.pathname;
		const name = safeDecodeURI(parsed.searchParams.get("name"));

		// GET /assets/<filename>?name=<addon>
		if (pathname.startsWith("/assets/")) {
			const rawFile = pathname.slice("/assets/".length);
			const fileName = safeDecodeURI(rawFile);

			if (!fileName) return send(400, "Bad filename encoding");
			if (!name) return send(400, "Missing name parameter");

			if (fileName.includes("..") || path.isAbsolute(fileName)) {
				return send(400, "Invalid filename");
			}

			const addonDir = ADDON_DIRS.get(name);
			if (!addonDir) return send(404, `Addon '${name}' not found`);

			const assetsRoot = findAssetsDir(addonDir);
			if (!assetsRoot) return send(404, "Assets folder not found for addon");

			const safeFileName = path.basename(fileName);
			const filePath = findFileRecursive(assetsRoot, safeFileName);

			if (!filePath)
				return send(404, `File '${safeFileName}' not found in assets`);

			if (!filePath.startsWith(assetsRoot + path.sep)) {
				return send(403, "Forbidden");
			}

			const stream = fs.createReadStream(filePath);

			stream.on("error", (err) => {
				console.error("[Assets] Stream error:", err);
				if (!res.headersSent) send(500, "Read error");
			});

			res.writeHead(200);
			stream.pipe(res);
			return;
		}

		if (pathname === "/download_asset" && req.method === "POST") {
			if (!name) return send(400, "Missing name parameter");

			const addonDir = path.join(addonsDirectory, name);
			let assetsRoot = findAssetsDir(addonDir);

			if (!assetsRoot) {
				assetsRoot = path.join(addonDir, "assets");

				try {
					fs.mkdirSync(assetsRoot, { recursive: true });
				} catch (err) {
					console.error("[download_asset] Cannot create assets dir:", err);
					return send(500, "Cannot create assets directory");
				}
			}

			let body = "";
			req.on("data", (chunk) => (body += chunk));

			req.on("end", async () => {
				let url, fileName;

				try {
					({ url, fileName } = JSON.parse(body));
				} catch {
					return send(400, "Invalid JSON body");
				}

				if (!url || typeof url !== "string") return send(400, "Missing url");

				if (!fileName || typeof fileName !== "string")
					return send(400, "Missing fileName");

				const safeFileName = path.basename(fileName);
				if (!safeFileName) return send(400, "Invalid fileName");
				const destPath = safeResolve(assetsRoot, safeFileName);

				if (!destPath)
					return send(400, "Invalid fileName (traversal detected)");
				try {
					const controller = new AbortController();
					const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

					let fetchRes;

					try {
						fetchRes = await fetch(url, {
							signal: controller.signal,
						});
					} finally {
						clearTimeout(timer);
					}

					if (!fetchRes.ok) {
						return send(502, `Fetch failed: HTTP ${fetchRes.status}`);
					}

					const buffer = Buffer.from(await fetchRes.arrayBuffer());
					fs.writeFileSync(destPath, buffer);
					console.log(`[download_asset] Saved '${safeFileName}' → ${destPath}`);
					res.writeHead(200, { "Content-Type": "application/json" });

					res.end(
						JSON.stringify({
							ok: true,
							fileName: safeFileName,
							path: destPath,
						}),
					);
				} catch (err) {
					console.error("[download_asset] Error:", err);
					if (!res.headersSent) send(500, `Download error: ${err.message}`);
				}
			});
			return;
		}

		// GET /get_handle?name=<addon>
		if (pathname === "/get_handle") {
			if (!name) return send(400, "Missing name parameter");

			let addonDir = ADDON_DIRS.get(name);
			if (!addonDir) {
				const candidate = path.join(addonsDirectory, name);
				try {
					if (fs.statSync(candidate).isDirectory()) {
						ADDON_DIRS.set(name, candidate);
						addonDir = candidate;
						console.log(`[get_handle] Lazy-registered addon '${name}' → ${candidate}`);
					}
				} catch (e) {
					console.error(`[get_handle] Lazy lookup failed for '${name}' at '${candidate}':`, e.message);
				}
			}
			if (!addonDir) {
				console.error(`[get_handle] Addon '${name}' not in ADDON_DIRS. addonsDirectory=${addonsDirectory} keys=[${[...ADDON_DIRS.keys()].join(", ")}]`);
				return send(404, `Addon '${name}' not found`);
			}

			const handleFile = findHandleFile(addonDir);
			if (!handleFile) {
				console.error("[get_handle] handleEvents.json not found in:", addonDir);
				return send(404, "handleEvents.json not found");
			}

			fs.readFile(handleFile, "utf8", (err, fileContent) => {
				if (err) {
					console.error("[get_handle] Read error:", err);
					return send(500, "Server error");
				}
				try {
					const parsedData = JSON.parse(fileContent);
					const wrapped = JSON.stringify({ data: parsedData });
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(wrapped);
				} catch (e) {
					console.error("[get_handle] Invalid JSON:", e);
					send(500, "Invalid JSON in handleEvents.json");
				}
			});
			return;
		}

		send(404, "Not found");
	});

	server.on("error", (err) => {
		console.error(`[Assets] Server error on port ${port}:`, err.message);
		resolve(port);
	});

	server.listen(port, "127.0.0.1", () => {
		serverStarted = true;
		assetServerPort = port;
		console.log(`[Assets] Server running on http://127.0.0.1:${port}`);
		resolve(port);
	});
	}); // end new Promise
}

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
				const fullPath = path.join(directory, entry.name);

				let stat;
				try {
					stat = fs.statSync(fullPath);
				} catch {
					console.warn(`[Addons] Broken symlink or inaccessible: ${fullPath}`);
					continue;
				}

				if (stat.isDirectory()) {
					if (entry.name.startsWith("!")) continue;

					if (directory === addonsDirectory && !ADDON_DIRS.has(entry.name)) {
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

					pending.push(loadFilesFromDirectory(fullPath, extension, callback));
					continue;
				}

				if (stat.isFile() && path.extname(entry.name) === extension) {
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
		const fullPath = path.join(directory, entry.name);

		let stat;
		try {
			stat = fs.statSync(fullPath);
		} catch {
			console.warn(`[Addons] Broken symlink or inaccessible: ${fullPath}`);
			continue;
		}

		if (stat.isDirectory()) {
			if (entry.name.startsWith("!")) continue;
			if (entry.name === "assets") continue;

			scanAddonCssFiles(fullPath, result);
			continue;
		}

		if (stat.isFile() && path.extname(entry.name) === ".css") {
			try {
				result.set(fullPath, {
					content: fs.readFileSync(fullPath, "utf8"),
					label: relativeAddonPath(fullPath),
				});
			} catch (err) {
				console.warn(
					`[Addons] Cannot read CSS file '${fullPath}':`,
					err.message,
				);
			}
		}
	}

	return result;
}

function scanAddonCssDirectories(directory = addonsDirectory, result = new Set()) {
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

function cssInjectionScript(filePath, cssContent) {
	return `(() => {
		const key = ${JSON.stringify(relativeAddonPath(filePath))};
		const css = ${JSON.stringify(cssContent)};
		const selector = \`style[data-nmc-addon-css="\${CSS.escape(key)}"]\`;
		let style = document.querySelector(selector);

		if (!style) {
			style = document.createElement("style");
			style.dataset.nmcAddonCss = key;
			document.head.appendChild(style);
		}

		if (style.textContent !== css) {
			style.textContent = css;
		}
	})();`;
}

function cssRemovalScript(filePath) {
	return `(() => {
		const key = ${JSON.stringify(relativeAddonPath(filePath))};
		document
			.querySelectorAll(\`style[data-nmc-addon-css="\${CSS.escape(key)}"]\`)
			.forEach((style) => style.remove());
	})();`;
}

async function execAddonScript(script, label) {
	if (!activeAddonsWindow || activeAddonsWindow.isDestroyed()) return;

	try {
		await activeAddonsWindow.webContents.executeJavaScript(script);
	} catch (err) {
		console.error(`[Addons] executeJavaScript failed for '${label}':`, err);
	}
}

async function applyCssSnapshot(cssSnapshot) {
	for (const [filePath, { content, label }] of cssSnapshot) {
		await execAddonScript(cssInjectionScript(filePath, content), label);
	}
}

async function rescanAddonCss() {
	if (!config.programSettings.addons.enable) return;
	if (cssRescanInProgress) return;

	cssRescanInProgress = true;

	try {
		let nextSnapshot;
		try {
			nextSnapshot = scanAddonCssFiles();
		} catch (err) {
			console.error("[Addons] CSS rescan failed:", err);
			return;
		}

		for (const [filePath, { content, label }] of nextSnapshot) {
			const pendingRemoval = pendingCssRemovals.get(filePath);
			if (pendingRemoval) {
				clearTimeout(pendingRemoval);
				pendingCssRemovals.delete(filePath);
			}

			if (addonCssCache.get(filePath) === content) continue;

			addonCssCache.set(filePath, content);
			console.log(`Update CSS: ${label}`);
			await execAddonScript(cssInjectionScript(filePath, content), label);
		}

		for (const filePath of [...addonCssCache.keys()]) {
			if (nextSnapshot.has(filePath)) continue;
			if (pendingCssRemovals.has(filePath)) continue;

			const label = relativeAddonPath(filePath);
			const timer = setTimeout(() => {
				pendingCssRemovals.delete(filePath);

				if (fs.existsSync(filePath)) {
					scheduleAddonCssRescan();
					return;
				}

				addonCssCache.delete(filePath);
				console.log(`Remove CSS: ${label}`);
				execAddonScript(cssRemovalScript(filePath), label);
			}, CSS_REMOVAL_GRACE_MS);

			timer.unref?.();
			pendingCssRemovals.set(filePath, timer);
		}

		refreshAddonCssWatchers();
	} finally {
		cssRescanInProgress = false;
	}
}

function scheduleAddonCssRescan() {
	clearTimeout(cssRescanTimer);
	cssRescanTimer = setTimeout(() => {
		rescanAddonCss().catch((err) =>
			console.error("[Addons] CSS live update failed:", err),
		);
	}, CSS_RESCAN_DELAY_MS);
}

function refreshAddonCssWatchers() {
	const directories = scanAddonCssDirectories();

	for (const [directory, watcher] of cssWatchers) {
		if (directories.has(directory)) continue;

		watcher.close();
		cssWatchers.delete(directory);
	}

	for (const directory of directories) {
		if (cssWatchers.has(directory)) continue;

		try {
			const watcher = fs.watch(directory, scheduleAddonCssRescan);
			cssWatchers.set(directory, watcher);
		} catch (err) {
			console.warn(
				`[Addons] Cannot watch CSS directory '${directory}':`,
				err.message,
			);
		}
	}
}

function startAddonCssLiveUpdates() {
	if (cssWatcherStarted) return;

	cssWatcherStarted = true;
	refreshAddonCssWatchers();
	cssPollingTimer = setInterval(scheduleAddonCssRescan, CSS_POLL_INTERVAL_MS);
	cssPollingTimer.unref?.();
	console.log("[Addons] CSS live updates enabled.");
}

// Online addon loader
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		return await res.text();
	} finally {
		clearTimeout(timer);
	}
}

async function applyAddons(mainWindow) {
	if (!config.programSettings.addons.enable) {
		console.log("Addons are disabled");
		return;
	}

	if (!mainWindow) {
		console.error("[Addons] mainWindow is not provided - aborting applyAddons");
		return;
	}

	console.log("Loading addons…");
	activeAddonsWindow = mainWindow;

	await startAssetServer();
	startAddonCssLiveUpdates();

	async function execJS(script, label) {
		await execAddonScript(script, label);
	}

	const cssSnapshot = scanAddonCssFiles();
	addonCssCache.clear();

	for (const [filePath, { content }] of cssSnapshot) {
		addonCssCache.set(filePath, content);
	}

	await applyCssSnapshot(cssSnapshot);

	await loadFilesFromDirectory(
		addonsDirectory,
		".js",
		(jsContent, filePath) => {
			const label = relativeAddonPath(filePath);
			console.log(`Load JS: ${label}`);
			execJS(jsContent, label);
		},
	);

	const onlineAddons = config.programSettings.addons.onlineScripts ?? [];

	await Promise.allSettled(
		onlineAddons.map(async (url) => {
			console.log(`Loading online addon: ${url}`);
			let content;

			try {
				content = await fetchWithTimeout(url);
			} catch (err) {
				console.error(`[Addons] Failed to fetch '${url}':`, err.message);
				return;
			}

			if (url.endsWith(".js")) {
				await execJS(content, url);
			} else if (url.endsWith(".css")) {
				await execJS(
					`(() => {
						const key = ${JSON.stringify(url)};
						const css = ${JSON.stringify(content)};
						const selector = \`style[data-nmc-online-addon-css="\${CSS.escape(key)}"]\`;
						let style = document.querySelector(selector);

						if (!style) {
							style = document.createElement("style");
							style.dataset.nmcOnlineAddonCss = key;
							document.head.appendChild(style);
						}

						style.textContent = css;
					})();`,
					url,
				);
			} else {
				console.warn(`[Addons] Unknown file type for online addon: ${url}`);
			}
		}),
	);

	console.log("Addons loaded.");
}

export { applyAddons, startAssetServer, loadFilesFromDirectory };
