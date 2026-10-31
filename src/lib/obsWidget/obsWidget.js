import fs from "fs";
import http from "http";
import net from "net";
import { WebSocket, WebSocketServer } from "ws";
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
	let pathname;
	try {
		pathname = decodeURIComponent(
			new URL(req.url || "/", "http://localhost").pathname,
		);
	} catch {
		res.writeHead(400);
		res.end("Bad request");
		return;
	}
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
	const {
		port = 4091,
		host = "127.0.0.1",
		staticDir = path.join(__dirname, "public"),
	} = options;

	if (server) return;

	server = http.createServer((req, res) => {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405);
			res.end();
			return;
		}
		serveStaticFile(req, res, staticDir);
	});

	server.on("error", (error) => {
		log("HTTP server error:", error.message);
		wss?.close();
		server = null;
		wss = null;
	});

	server.listen(port, host, () => {
		log(`HTTP server listening on http://${host}:${port}`);
	});

	wss = new WebSocketServer({
		server,
		maxPayload: 64 * 1024,
		verifyClient: ({ origin, req }) => {
			try {
				const parsed = new URL(origin);
				return (
					parsed.origin === "https://music.yandex.ru" ||
					(parsed.protocol === "http:" &&
						parsed.host === req.headers.host &&
						(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
							(host !== "127.0.0.1" && net.isIP(parsed.hostname) !== 0)))
				);
			} catch {
				return false;
			}
		},
	});
	wss.on("error", (error) => log("WebSocket server error:", error.message));

	wss.on("connection", (ws) => {
		ws.on("error", (error) => log("WebSocket error:", error.message));
		if (lastData) ws.send(JSON.stringify(lastData));

		ws.on("message", (msg) => {
			try {
				const data = JSON.parse(msg.toString());
				if (!data || typeof data !== "object" || Array.isArray(data)) return;
				lastData = data;

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

	for (const client of wss.clients) client.terminate();
	wss.close();
	server.close();

	server = null;
	wss = null;
	lastData = null;
}

export function getLastTrack() {
	return lastData;
}
