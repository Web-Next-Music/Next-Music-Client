import fs from "fs";
import http from "http";
import WebSocket from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server = null;
let wss = null;
let lastData = null;

function log(...args) {
	console.log("[OBS-WIDGET]", ...args);
}

function getContentType(filePath) {
	const ext = path.extname(filePath).toLowerCase();

	switch (ext) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
			return "application/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".gif":
			return "image/gif";
		case ".svg":
			return "image/svg+xml";
		case ".ico":
			return "image/x-icon";
		default:
			return "application/octet-stream";
	}
}

function serveStaticFile(req, res, staticDir) {
	const requestUrl = new URL(req.url || "/", "http://localhost");
	let pathname = decodeURIComponent(requestUrl.pathname);
	if (pathname === "/") pathname = "/index.html";

	const rootDir = path.resolve(staticDir);
	const filePath = path.resolve(rootDir, `.${pathname}`);

	if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
		res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
		res.end("Forbidden");
		return;
	}

	fs.readFile(filePath, (error, data) => {
		if (error) {
			res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
			res.end("Not found");
			return;
		}

		res.writeHead(200, {
			"Content-Type": getContentType(filePath),
			"Content-Length": data.length,
		});
		res.end(data);
	});
}

export function startServer(options = {}) {
	const { port = 4091, staticDir = path.join(__dirname, "public") } = options;

	if (server) return;

	server = http.createServer((req, res) => {
		serveStaticFile(req, res, staticDir);
	});

	server.listen(port, "0.0.0.0", () => {
		log(`HTTP server listening on http://0.0.0.0:${port}`);
	});

	wss = new WebSocket.Server({ server });

	wss.on("connection", (ws) => {
		if (lastData) ws.send(JSON.stringify(lastData));

		ws.on("message", (msg) => {
			try {
				lastData = JSON.parse(msg.toString());

				wss.clients.forEach((client) => {
					if (client.readyState === WebSocket.OPEN) {
						client.send(JSON.stringify(lastData));
					}
				});
			} catch (e) {
				log("Invalid WS message", e);
			}
		});
	});
}

export function stopServer() {
	if (!server) return;

	wss.close();
	server.close();

	server = null;
	wss = null;
	lastData = null;
}

export function getLastTrack() {
	return lastData;
}
