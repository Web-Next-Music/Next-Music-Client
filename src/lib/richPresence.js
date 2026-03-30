import { Client } from "@xhayper/discord-rpc";
import WebSocket from "ws";

const CLIENT_ID = "1300258490815741952";
const GITHUB_LINK = `https://github.com/Web-Next-Music/Next-Music-Client`;
const WSPORT = 6972;

let rpc;
let isReady = false;
let lastActivity = null;
let lastPlayerState = null;
let globalConfig = null;

// --- Initialize RPC ---
function initRPC() {
    rpc = new Client({ clientId: CLIENT_ID, transport: { type: "ipc" } });

    rpc.on("ready", () => {
        console.log("[RPC] Connected to Discord!");
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
    console.log(`[WS] WebSocket server listening at ws://127.0.0.1:${WSPORT}`),
);

wss.on("connection", (ws) => {
    console.log("[WS] New connection");
    ws.on("message", (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            updateActivity(data, globalConfig);
        } catch (e) {
            console.error("[WS] ❌ Error parsing data:", e);
        }
    });
});

// --- Update Discord activity ---
function updateActivity(data, config) {
    if (!rpc || !isReady) return;

    const title = data.title || "";
    const artist = data.artists || "";
    const img = data.img || "icon";
    const albumUrl = data.albumUrl || ""; // пусто для приватных треков
    const artistUrl = data.artistUrl || "";

    // Позиция и длительность в секундах (поля из siteRPCServer)
    const positionSec = data.positionSec ?? 0;
    const durationSec = data.durationSec ?? 0;
    const hasTimestamps = durationSec > 0 && positionSec > 0;

    const now = Math.floor(Date.now() / 1000);
    const startTimestamp = now - Math.floor(positionSec);
    const endTimestamp = startTimestamp + Math.floor(durationSec);

    const activityObject = {
        name: config?.programSettings?.richPresence?.rpcTitle || "Next Music",
        type: 2,
        details: title,
        state: artist,
        largeImageKey: img,
        largeImageUrl: GITHUB_LINK,
        statusDisplayType: 1,
        instance: false,
        ...(albumUrl ? { detailsUrl: albumUrl } : {}),
        ...(artistUrl ? { stateUrl: artistUrl } : {}),
        ...(hasTimestamps ? { startTimestamp, endTimestamp } : {}),
        buttons: [
            // Кнопка трека — только если albumUrl есть (скрываем для приватных треков)
            ...(config?.programSettings?.richPresence?.buttons?.trackButton &&
            albumUrl
                ? [{ label: "Open in Yandex Music", url: albumUrl }]
                : []),
            ...(config?.programSettings?.richPresence?.buttons?.githubButton
                ? [{ label: "Next Music Project", url: GITHUB_LINK }]
                : []),
        ],
    };

    const playerState = (data.playerState || "").toLowerCase();

    // Пауза / стоп — очищаем активность
    if (playerState !== "playing") {
        if (lastPlayerState !== "pause") {
            console.log(
                `[RPC] Clearing activity (${playerState || "unknown"})`,
            );
            rpc.user?.clearActivity().catch(console.error);
            lastPlayerState = "pause";
            lastActivity = null;
        }
        return;
    }

    // Трек играет
    const hasChanged =
        !lastActivity ||
        lastActivity.details !== activityObject.details ||
        lastActivity.state !== activityObject.state ||
        lastActivity.largeImageKey !== activityObject.largeImageKey ||
        lastPlayerState !== "play";

    const timestampDiff =
        lastActivity?.startTimestamp != null
            ? Math.abs(
                  activityObject.startTimestamp - lastActivity.startTimestamp,
              )
            : Infinity;

    if (hasChanged) {
        console.log(`[RPC] Setting new activity: ${title} — ${artist}`);
        rpc.user?.setActivity(activityObject).catch(console.error);
        lastActivity = { ...activityObject };
        lastPlayerState = "play";
    } else if (hasTimestamps && timestampDiff > 1) {
        console.log(`[RPC] Updating timestamps for: ${title} — ${artist}`);
        rpc.user
            ?.setActivity({
                ...lastActivity,
                startTimestamp,
                endTimestamp,
            })
            .catch(console.error);
        lastActivity.startTimestamp = startTimestamp;
        lastActivity.endTimestamp = endTimestamp;
    }
}

// --- Initialize Discord RPC if enabled ---
function presenceService(config) {
    globalConfig = config;
    initRPC();
}

export { initRPC, updateActivity, presenceService };
