import { getPaths } from "../../config.js";
import fs from "fs";
import path from "path";
import http from "http";

import { fileURLToPath } from "url";
import {
	safeDecodeURI,
	safeResolve,
	findAssetsDir,
	findFileRecursive,
	findHandleFile,
} from "./fsUtils.js";

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

function startAssetServer(port = 2007) {
	if (serverStarted) return Promise.resolve(assetServerPort);

	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			function send(status, body, headers = {}) {
				res.writeHead(status, {
					"Content-Type": "text/plain",
					...headers,
				});
				res.end(body);
			}

			let parsed;

			try {
				parsed = new URL(
					req.url,
					`http://127.0.0.1:${assetServerPort}`,
				);
			} catch {
				return send(400, "Bad URL");
			}

			const pathname = parsed.pathname;
			const name = safeDecodeURI(parsed.searchParams.get("name"));

			if (pathname.startsWith("/app_asset/")) {
				const rawFile = pathname.slice("/app_asset/".length);
				const relFile = safeDecodeURI(rawFile);

				if (!relFile) return send(400, "Bad filename encoding");

				const filePath = safeResolve(
					APP_ASSETS_DIR,
					...relFile.split("/"),
				);

				if (!filePath) return send(400, "Invalid path");
				if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile())
					return send(404, "Asset not found");

				const mime =
					APP_ASSET_MIME[path.extname(filePath).toLowerCase()] ||
					"application/octet-stream";

				const stream = fs.createReadStream(filePath);
				stream.on("error", (err) => {
					console.error("[Assets] app_asset stream error:", err);
					if (!res.headersSent) send(500, "Read error");
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
				if (!addonDir) return send(404, `Addon '${name}' not found`);

				const assetsRoot = findAssetsDir(addonDir);
				if (!assetsRoot)
					return send(404, "Assets folder not found for addon");

				const safeFileName = path.basename(fileName);
				const filePath = findFileRecursive(assetsRoot, safeFileName);

				if (!filePath)
					return send(
						404,
						`File '${safeFileName}' not found in assets`,
					);

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
						console.error(
							"[download_asset] Cannot create assets dir:",
							err,
						);
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

					if (!url || typeof url !== "string")
						return send(400, "Missing url");

					if (!fileName || typeof fileName !== "string")
						return send(400, "Missing fileName");

					const safeFileName = path.basename(fileName);
					if (!safeFileName) return send(400, "Invalid fileName");
					const destPath = safeResolve(assetsRoot, safeFileName);

					if (!destPath)
						return send(
							400,
							"Invalid fileName (traversal detected)",
						);
					try {
						const controller = new AbortController();
						const timer = setTimeout(
							() => controller.abort(),
							FETCH_TIMEOUT_MS,
						);

						let fetchRes;

						try {
							fetchRes = await fetch(url, {
								signal: controller.signal,
							});
						} finally {
							clearTimeout(timer);
						}

						if (!fetchRes.ok) {
							return send(
								502,
								`Fetch failed: HTTP ${fetchRes.status}`,
							);
						}

						const buffer = Buffer.from(
							await fetchRes.arrayBuffer(),
						);
						fs.writeFileSync(destPath, buffer);
						console.log(
							`[download_asset] Saved '${safeFileName}' → ${destPath}`,
						);
						res.writeHead(200, {
							"Content-Type": "application/json",
						});

						res.end(
							JSON.stringify({
								ok: true,
								fileName: safeFileName,
								path: destPath,
							}),
						);
					} catch (err) {
						console.error("[download_asset] Error:", err);
						if (!res.headersSent)
							send(500, `Download error: ${err.message}`);
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
						if (fs.statSync(candidate).isDirectory()) {
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
				if (!addonDir) {
					console.error(
						`[get_handle] Addon '${name}' not in ADDON_DIRS. addonsDirectory=${addonsDirectory} keys=[${[...ADDON_DIRS.keys()].join(", ")}]`,
					);
					return send(404, `Addon '${name}' not found`);
				}

				const handleFile = findHandleFile(addonDir);
				if (!handleFile) {
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
			console.error(
				`[Assets] Server error on port ${port}:`,
				err.message,
			);
			resolve(port);
		});

		server.listen(port, "127.0.0.1", () => {
			serverStarted = true;
			assetServerPort = port;
			console.log(`[Assets] Server running on http://127.0.0.1:${port}`);
			resolve(port);
		});
	});
}

export { startAssetServer, ADDON_DIRS, FETCH_TIMEOUT_MS };
