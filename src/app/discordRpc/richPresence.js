"use strict";

const { Client } = require("@xhayper/discord-rpc");
const WebSocket = require("ws");
const config = require("../../main.js");

const CLIENT_ID = "1300258490815741952";
const GITHUB_LINK = `https://github.com/Web-Next-Music/Next-Music-Client`
const WSPORT = 6972;

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
        setTimeout(initRPC, 2000);
    });

    rpc.on("error", console.error);

    rpc.login().catch(console.error);
}

// --- WebSocket server ---
const wss = new WebSocket.Server({ port: WSPORT }, () =>
    console.log(`[WS] ✅ WebSocket server listening at ws://127.0.0.1:${WSPORT}`),
);

wss.on("connection", ws => {
    console.log("[WS] 🔌 New connection");

    ws.on("message", msg => {
        try {
            const data = JSON.parse(msg.toString());
            updateActivity(data);
        } catch (e) {
            console.error("[WS] ❌ Error parsing data:", e);
        }
    });
});

// --- Parse time hh:mm:ss or mm:ss ---
function parseTime(timeString) {
    if (!timeString) return 0;
    const parts = timeString.split(":").map(Number);
    return parts.length === 2
        ? parts[0] * 60 + parts[1]
        : parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : 0;
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
        type: 2,
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

    const playerState = data.playerState?.toLowerCase() || "";

    // --- Если в паузе, очищаем активность сразу ---
    if (playerState.includes("play")) {
        console.log(`[RPC] ⏸ Clearing activity (pause)`);
        rpc.user?.clearActivity().catch(console.error);
        lastPlayerState = "pause";
        return;
    }

    // --- Если идёт трек ---
    if (playerState.includes("pause") || playerState.includes("playing")) {
        const hasChanged =
            !lastActivity ||
            lastActivity.details !== activityObject.details ||
            lastActivity.state !== activityObject.state ||
            lastActivity.largeImageKey !== activityObject.largeImageKey ||
            lastPlayerState !== "play";

        // Проверка для обновления только таймстампов
        const timestampDiff = lastActivity ? Math.abs(activityObject.startTimestamp - lastActivity.startTimestamp) : Infinity;

        if (hasChanged) {
            console.log(`[RPC] 🎧 Setting new activity: ${title} — ${artist}`, activityObject);
            rpc.user?.setActivity(activityObject).catch(console.error);
            lastActivity = activityObject;
            lastPlayerState = "play";
        } else if (timestampDiff > 1) {
            console.log(`[RPC] 🔄 Updating timestamps for: ${title} — ${artist}`, { startTimestamp, endTimestamp });
            rpc.user?.setActivity({ ...lastActivity, startTimestamp, endTimestamp }).catch(console.error);
            lastActivity.startTimestamp = startTimestamp; // обновляем последний таймстамп
            lastActivity.endTimestamp = endTimestamp;
        }
    }
}

module.exports = { initRPC };
