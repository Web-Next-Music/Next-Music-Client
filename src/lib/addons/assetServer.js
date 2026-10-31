import { getPaths } from "../../config.js";
import fs from "fs";
import path from "path";
import http from "http";

import { fileURLToPath } from "url";
import { safeDecodeURI, safeResolve } from "./fsUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ASSETS_DIR = path.join(__dirname, "..", "..", "assets");

const APP_ASSET_MIME = {
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".ogg": "audio/ogg",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".webm": "video/webm",
};

const { addonsDirectory } = getPaths();

const ADDON_DIRS = new Map();
let serverStarted = false;
let assetServerPort = 2007;

const FETCH_TIMEOUT_MS = 10_000;

function within(root, target) {
	try {
		const base = fs.realpathSync(root);
		const resolved = fs.realpathSync(target);
		return resolved === base || resolved.startsWith(base + path.sep);
	} catch {
		return false;
	}
}

function findEntry(root, predicate) {
	const queue = [root];
	while (queue.length) {
		const current = queue.shift();
		let entries;
		try {
			entries = fs.readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isSymbolicLink()) continue;
			const full = path.join(current, entry.name);
			if (predicate(entry)) return full;
			if (entry.isDirectory()) queue.push(full);
		}
	}
	return null;
}

function findAssetsDir(root) {
	return findEntry(
		root,
		(entry) => entry.isDirectory() && entry.name === "assets",
	);
}

function findFileRecursive(root, name) {
	return findEntry(root, (entry) => entry.isFile() && entry.name === name);
}

function findHandleFile(root) {
	const assets = findAssetsDir(root);
	const adjacent =
		assets && path.join(path.dirname(assets), "handleEvents.json");
	if (adjacent && within(root, adjacent)) return adjacent;
	return findFileRecursive(root, "handleEvents.json");
}

let starting = null;

function startAssetServer(port = 2007) {
	if (serverStarted) return Promise.resolve(assetServerPort);
	if (starting) return starting;

	starting = new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			res.setHeader("X-Content-Type-Options", "nosniff");
			req.on("error", (error) =>
				console.error("[Assets] Request error:", error),
			);
			res.on("error", (error) =>
				console.error("[Assets] Response error:", error),
			);
			function send(status, body, headers = {}) {
				res.writeHead(status, {
					"Content-Type": "text/plain",
					...headers,
				});
				res.end(body);
			}

			const host = req.headers.host || "";
			if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
				return send(403, "Forbidden host");
			}
			if (
				req.method !== "GET" &&
				req.method !== "HEAD" &&
				req.method !== "POST"
			) {
				return send(405, "Method not allowed");
			}

			let parsed;

			try {
				parsed = new URL(req.url, `http://127.0.0.1:${assetServerPort}`);
			} catch {
				return send(400, "Bad URL");
			}

			const pathname = parsed.pathname;
			const name = parsed.searchParams.get("name");
			if (name && (name === "." || name === ".." || /[\\/\0]/.test(name))) {
				return send(400, "Invalid addon name");
			}

			if (pathname.startsWith("/app_asset/")) {
				const rawFile = pathname.slice("/app_asset/".length);
				const relFile = safeDecodeURI(rawFile);

				if (!relFile) return send(400, "Bad filename encoding");

				const filePath = safeResolve(APP_ASSETS_DIR, ...relFile.split("/"));

				if (!filePath) return send(400, "Invalid path");
				if (!within(APP_ASSETS_DIR, filePath))
					return send(404, "Asset not found");
				try {
					if (!fs.statSync(filePath).isFile())
						return send(404, "Asset not found");
				} catch {
					return send(404, "Asset not found");
				}

				const mime =
					APP_ASSET_MIME[path.extname(filePath).toLowerCase()] ||
					"application/octet-stream";

				const stream = fs.createReadStream(filePath);
				stream.on("error", (err) => {
					console.error("[Assets] app_asset stream error:", err);
					if (!res.headersSent) send(500, "Read error");
					else res.destroy();
				});

				res.writeHead(200, { "Content-Type": mime });
				stream.pipe(res);
				return;
			}

			if (pathname.startsWith("/assets/")) {
				const rawFile = pathname.slice("/assets/".length);
				const fileName = safeDecodeURI(rawFile);

				if (!fileName) return send(400, "Bad filename encoding");
				if (!name) return send(400, "Missing name parameter");

				if (fileName.includes("..") || path.isAbsolute(fileName)) {
					return send(400, "Invalid filename");
				}

				const addonDir = ADDON_DIRS.get(name);
				if (!addonDir || !within(addonsDirectory, addonDir))
					return send(404, `Addon '${name}' not found`);

				const assetsRoot = findAssetsDir(addonDir);
				if (!assetsRoot) return send(404, "Assets folder not found for addon");

				const safeFileName = path.basename(fileName);
				const filePath = findFileRecursive(assetsRoot, safeFileName);

				if (!filePath)
					return send(404, `File '${safeFileName}' not found in assets`);

				if (!within(addonDir, assetsRoot) || !within(assetsRoot, filePath)) {
					return send(403, "Forbidden");
				}

				const stream = fs.createReadStream(filePath);

				stream.on("error", (err) => {
					console.error("[Assets] Stream error:", err);
					if (!res.headersSent) send(500, "Read error");
					else res.destroy();
				});

				res.writeHead(200);
				stream.pipe(res);
				return;
			}

			if (pathname === "/download_asset" && req.method === "POST") {
				if (!name) return send(400, "Missing name parameter");

				const addonDir = path.join(addonsDirectory, name);
				if (!within(addonsDirectory, addonDir)) {
					return send(404, `Addon '${name}' not found`);
				}

				let body = "";
				req.on("data", (chunk) => (body += chunk));
				req.on("end", async () => {
					let data;
					try {
						data = JSON.parse(body);
					} catch {
						return send(400, "Invalid JSON body");
					}

					const { url, fileName } = data || {};
					if (!url || typeof url !== "string") return send(400, "Missing url");
					if (!fileName || typeof fileName !== "string") {
						return send(400, "Missing fileName");
					}
					const safeFileName = path.basename(fileName);
					if (
						!safeFileName ||
						safeFileName === "." ||
						safeFileName === ".." ||
						/[\\/\0]/.test(safeFileName)
					)
						return send(400, "Invalid fileName");

					try {
						let assetsRoot = findAssetsDir(addonDir);
						if (!assetsRoot) {
							assetsRoot = path.join(addonDir, "assets");
							fs.mkdirSync(assetsRoot, { recursive: true });
						}
						if (
							!within(addonsDirectory, addonDir) ||
							!within(addonDir, assetsRoot)
						)
							return send(403, "Forbidden");

						const destPath = safeResolve(assetsRoot, safeFileName);
						if (!destPath) return send(400, "Invalid fileName");

						const controller = new AbortController();
						const timer = setTimeout(
							() => controller.abort(),
							FETCH_TIMEOUT_MS,
						);
						let buffer;
						try {
							const fetchRes = await fetch(url, { signal: controller.signal });
							if (!fetchRes.ok) {
								return send(502, `Fetch failed: HTTP ${fetchRes.status}`);
							}
							buffer = Buffer.from(await fetchRes.arrayBuffer());
						} finally {
							clearTimeout(timer);
						}

						if (
							!within(addonsDirectory, addonDir) ||
							!within(addonDir, assetsRoot)
						)
							return send(403, "Forbidden");
						const flags =
							fs.constants.O_WRONLY |
							fs.constants.O_CREAT |
							fs.constants.O_TRUNC |
							(fs.constants.O_NOFOLLOW || 0);
						if (fs.existsSync(destPath) && !within(assetsRoot, destPath)) {
							return send(403, "Forbidden");
						}
						fs.writeFileSync(destPath, buffer, { flag: flags });
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

			if (pathname === "/get_handle") {
				if (!name) return send(400, "Missing name parameter");

				let addonDir = ADDON_DIRS.get(name);
				if (!addonDir) {
					const candidate = path.join(addonsDirectory, name);
					try {
						if (
							within(addonsDirectory, candidate) &&
							fs.statSync(candidate).isDirectory()
						) {
							ADDON_DIRS.set(name, candidate);
							addonDir = candidate;
							console.log(
								`[get_handle] Lazy-registered addon '${name}' → ${candidate}`,
							);
						}
					} catch (e) {
						console.error(
							`[get_handle] Lazy lookup failed for '${name}' at '${candidate}':`,
							e.message,
						);
					}
				}
				if (!addonDir || !within(addonsDirectory, addonDir)) {
					console.error(
						`[get_handle] Addon '${name}' not in ADDON_DIRS. addonsDirectory=${addonsDirectory} keys=[${[...ADDON_DIRS.keys()].join(", ")}]`,
					);
					return send(404, `Addon '${name}' not found`);
				}

				const handleFile = findHandleFile(addonDir);
				if (!handleFile || !within(addonDir, handleFile)) {
					console.error(
						"[get_handle] handleEvents.json not found in:",
						addonDir,
					);
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
						res.writeHead(200, {
							"Content-Type": "application/json",
						});
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
			starting = null;
			reject(err);
		});

		server.listen(port, "127.0.0.1", () => {
			serverStarted = true;
			assetServerPort = server.address().port;
			console.log(`[Assets] Server running on http://127.0.0.1:${port}`);
			resolve(assetServerPort);
		});
	});
	return starting;
}

export { startAssetServer, ADDON_DIRS, FETCH_TIMEOUT_MS };
