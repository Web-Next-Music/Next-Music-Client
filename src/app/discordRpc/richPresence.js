"use strict";

const { Client } = require("@xhayper/discord-rpc");
const WebSocket = require("ws");

const CLIENT_ID = "1300258490815741952"; // your Discord Client ID
let rpc;
let isReady = false;
let lastActivity;
let lastTimeCurrentPerPlayer = {}; // stores last timeCurrent for each player

// --- Initialize RPC ---
function initRPC() {
    rpc = new Client({ clientId: CLIENT_ID, transport: { type: "ipc" } });

    rpc.on("ready", () => {
        console.log("[RPC] ✅ Connected to Discord!");
        isReady = true;
    });

    rpc.on("disconnected", () => {
        console.log("[RPC] ❌ Disconnected from Discord, reconnecting...");
        isReady = false;
        setTimeout(initRPC, 5000);
    });

    rpc.on("error", console.error);

    rpc.login().catch(console.error);
}

// --- WebSocket server ---
const wss = new WebSocket.Server({ port: 8765 }, () =>
    console.log("[WS] ✅ WebSocket server listening at ws://localhost:8765"),
);

wss.on("connection", (ws) => {
    console.log("[WS] 🔌 New connection");

    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            updateActivity(data);
        } catch (e) {
            console.error("[WS] ❌ Error parsing data:", e);
        }
    });

    ws.on("close", () => console.log("[WS] ⚠️ Connection closed"));
    ws.on("error", (err) => console.error("[WS] ❌ WS error:", err));
});

// --- Parse time hh:mm:ss or mm:ss ---
function parseTime(timeString) {
    if (!timeString) return 0;
    const parts = timeString.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1]; // mm:ss
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // hh:mm:ss
    return 0;
}

// --- Update Discord activity ---
function updateActivity(data) {
    if (!rpc || !isReady) return;
    const playerIndex = data.playerIndex ?? 0;

    // If no data, clear activity
    if (!data || (!data.title && !data.artists && !data.img)) {
        if (lastActivity) {
            rpc.user?.clearActivity().catch(console.error);
            lastActivity = undefined;
            lastTimeCurrentPerPlayer[playerIndex] = undefined;
            console.log("[RPC] ⚪ Activity cleared (no data)");
        }
        return;
    }

    const title = data.title || "";
    const artist = data.artists || "";
    const img = data.img || "icon";

    const now = Math.floor(Date.now() / 1000);
    const current = parseTime(data.timeCurrent);
    const total = parseTime(data.timeEnd);

    // --- Check if timeCurrent is changing
    const lastTime = lastTimeCurrentPerPlayer[playerIndex];
    const paused = lastTime === current; // if not changing → paused
    lastTimeCurrentPerPlayer[playerIndex] = current;

    if (paused || total === 0 || current >= total) {
        if (lastActivity) {
            rpc.user?.clearActivity().catch(console.error);
            lastActivity = undefined;
            console.log(
                `[RPC] ⚪ Track paused or finished — activity cleared: ${title} — ${artist}`,
            );
        }
        return;
    }

    const startTimestamp = now - current;
    const endTimestamp = startTimestamp + total;

    const activityObject = {
        type: 2, // LISTENING
        details: title,
        state: artist,
        largeImageKey: img,
        startTimestamp,
        endTimestamp,
        statusDisplayType: 1,
        instance: false,
    };

    // Only update activity if title, artist, image, or timestamps changed
    const hasChanged =
        !lastActivity ||
        lastActivity.details !== activityObject.details ||
        lastActivity.state !== activityObject.state ||
        lastActivity.largeImageKey !== activityObject.largeImageKey ||
        lastActivity.startTimestamp !== activityObject.startTimestamp ||
        lastActivity.endTimestamp !== activityObject.endTimestamp;

    if (hasChanged) {
        rpc.user?.setActivity(activityObject).catch(console.error);
        lastActivity = activityObject;
        console.log(`[RPC] 🎧 Listening to ${title} — ${artist}`);
    }
}

// --- Start ---
initRPC();

module.exports = { initRPC };