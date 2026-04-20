import { loadConfig, getPaths } from "../config.js";
import fs from "fs";
import path from "path";
import http from "http";

const { addonsDirectory } = getPaths();
const config = loadConfig();

const ADDON_DIRS = new Map();
let serverStarted = false;
let assetServerPort = 2007;

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

function startAssetServer(preferredPort = 2007, attempt = 0) {
	if (serverStarted) return;

	const port = preferredPort + attempt;

	if (attempt >= 10) {
		console.error(
			"[Assets] Could not bind to any port in range",
			preferredPort,
			"–",
			port - 1,
		);
		return;
	}

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

			const addonDir = ADDON_DIRS.get(name);
			if (!addonDir) return send(404, `Addon '${name}' not found`);

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
		if (err.code === "EADDRINUSE") {
			console.warn(`[Assets] Port ${port} is busy, trying ${port + 1}…`);
			startAssetServer(preferredPort, attempt + 1);
		} else {
			console.error("[Assets] Server error:", err);
		}
	});

	server.listen(port, "127.0.0.1", () => {
		serverStarted = true;
		assetServerPort = port;
		console.log(`[Assets] Server running on http://127.0.0.1:${port}`);
	});
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
		console.error("[Addons] mainWindow is not provided — aborting applyAddons");
		return;
	}

	console.log("Loading addons…");

	startAssetServer();

	async function execJS(script, label) {
		try {
			await mainWindow.webContents.executeJavaScript(script);
		} catch (err) {
			console.error(`[Addons] executeJavaScript failed for '${label}':`, err);
		}
	}

	function cssInjectionScript(cssContent) {
		const escaped = cssContent.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

		return `(() => {
            const style = document.createElement('style');
            style.textContent = \`${escaped}\`;
            document.head.appendChild(style);
        })();`;
	}

	await loadFilesFromDirectory(
		addonsDirectory,
		".css",
		(cssContent, filePath) => {
			const label = path.relative(addonsDirectory, filePath);
			console.log(`Load CSS: ${label}`);
			execJS(cssInjectionScript(cssContent), label);
		},
	);

	await loadFilesFromDirectory(
		addonsDirectory,
		".js",
		(jsContent, filePath) => {
			const label = path.relative(addonsDirectory, filePath);
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
				await execJS(cssInjectionScript(content), url);
			} else {
				console.warn(`[Addons] Unknown file type for online addon: ${url}`);
			}
		}),
	);

	console.log("Addons loaded.");
}

export { applyAddons, startAssetServer, loadFilesFromDirectory };
