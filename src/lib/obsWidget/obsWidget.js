import express from "express";
import WebSocket from "ws";
import path from "path";

let app = null;
let server = null;
let wss = null;
let lastData = null;

function log(...args) {
    console.log("[OBS-WIDGET]", ...args);
}

export function startServer(options = {}) {
    const { port = 4091, staticDir = path.join(process.cwd(), "public") } =
        options;

    if (server) return;

    app = express();
    app.use(express.static(staticDir));

    server = app.listen(port, "0.0.0.0", () => {
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

    app = null;
    server = null;
    wss = null;
    lastData = null;
}

export function getLastTrack() {
    return lastData;
}
