"use strict";

const { Client } = require("@xhayper/discord-rpc");
const WebSocket = require("ws");
const config = require("../../index.js");

const CLIENT_ID = "1300258490815741952"; // your Discord Client ID
const GITHUB_LINK = `https://github.com/Web-Next-Music/Next-Music-Client`
let rpc;
let isReady = false;
let lastActivity;
let lastPlayerState = null;

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
const wss = new WebSocket.Server({ port: 6972 }, () =>
    console.log("[WS] ✅ WebSocket server listening at ws://127.0.0.1:8765"),
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

    const title = data.title || "";
    const artist = data.artists || "";
    const img = data.img || "icon";
    const albumUrl = data.albumUrl || "";
    const artistUrl = data.artistUrl || "";

    const now = Math.floor(Date.now() / 1000);
    const current = parseTime(data.timeCurrent);
    const total = parseTime(data.timeEnd);
    const startTimestamp = now - current;
    const endTimestamp = startTimestamp + total;

    const activityObject = {
        name: config.programSettings.richPresence.rpcTitle,
        type: 2, // LISTENING
        details: title,
        state: artist,
        largeImageKey: img,
        largeImageUrl: GITHUB_LINK,
        startTimestamp,
        endTimestamp,
        statusDisplayType: 1,
        instance: false,
        ...(albumUrl ? { detailsUrl: albumUrl } : {}),
        ...(artistUrl ? { stateUrl: artistUrl } : {})
    };

    // Пауза
    if (data.playerState?.includes('play')) {
        if (lastPlayerState !== 'pause') {
            rpc.user?.clearActivity().catch(console.error);
            console.log("[RPC] ⏸ Activity cleared (paused)");
            lastPlayerState = 'pause';
        }
        return;
    }

    // Воспроизведение
    if (data.playerState?.includes('pause')) {
        const hasChanged =
            !lastActivity ||
            lastActivity.details !== activityObject.details ||
            lastActivity.state !== activityObject.state ||
            lastActivity.largeImageKey !== activityObject.largeImageKey ||
            lastPlayerState !== 'play'; // обновляем, если сменился статус

        if (hasChanged) {
            rpc.user?.setActivity(activityObject).catch(console.error);
            lastActivity = activityObject;
            lastPlayerState = 'play';
            console.log(`[RPC] 🎧 Listening to ${title} — ${artist}`);
        } else {
            // Даже если песня не поменялась, обновляем таймстампы
            rpc.user?.setActivity({ ...lastActivity, startTimestamp, endTimestamp }).catch(console.error);
        }
    }
}

initRPC();

module.exports = { initRPC };