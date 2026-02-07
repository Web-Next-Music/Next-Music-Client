const express = require("express");
const WebSocket = require("ws");
const path = require("path");

let app = null;
let server = null;
let wss = null;
let lastData = null;

function log(...args) {
    console.log("[OBS-WIDGET]", ...args);
}

function startServer(options = {}) {
    const { port = 4091, staticDir = path.join(__dirname, "public") } = options;

    if (server) {
        log("Server already running");
        return;
    }

    log("Starting server...");

    app = express();
    app.use(express.static(staticDir));

    // Слушаем на 0.0.0.0, чтобы OBS и внешние приложения могли подключиться
    server = app.listen(port, "0.0.0.0", () => {
        log(`HTTP server listening on http://0.0.0.0:${port}`);
    });

    wss = new WebSocket.Server({ server });

    wss.on("connection", (ws) => {
        log("WebSocket client connected");

        if (lastData) {
            log("Sending cached track to new client");
            ws.send(JSON.stringify(lastData));
        }

        ws.on("message", (msg) => {
            try {
                const data = JSON.parse(msg.toString());
                lastData = data;

                // Рассылаем всем клиентам
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(lastData));
                    }
                });
            } catch (e) {
                log("Invalid WS message", e);
            }
        });

        ws.on("close", () => {
            log("WebSocket client disconnected");
        });
    });
}

function stopServer() {
    if (!server) {
        log("Server not running");
        return;
    }

    log("Stopping server...");

    wss.close();
    server.close();

    app = null;
    server = null;
    wss = null;
    lastData = null;
}

function getLastTrack() {
    return lastData;
}

module.exports = {
    startServer,
    stopServer,
    getLastTrack,
};
