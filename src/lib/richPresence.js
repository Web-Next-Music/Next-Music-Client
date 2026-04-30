import { Client } from "@xhayper/discord-rpc";
import WebSocket from "ws";

const CLIENT_ID = "1300258490815741952";
const GITHUB_LINK = `https://github.com/Web-Next-Music/Next-Music-Client`;
const NM_WEBSITE_LINK = `https://nm.diram1x.ru`;
const WSPORT = 6972;

let rpc;
let isReady = false;
let lastActivity = null;
let lastPlayerState = null;
let globalConfig = null;

let lastRawData = null;

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

// WebSocket server
const wss = new WebSocket.Server({ port: WSPORT }, () =>
	console.log(`[WS] WebSocket server listening at ws://127.0.0.1:${WSPORT}`),
);

// Broadcast raw to all site clients
function broadcastToSiteClients(data, sender) {
	const msg = JSON.stringify(data);

	wss.clients.forEach((client) => {
		if (client !== sender && client.readyState === WebSocket.OPEN) {
			client.send(msg);
		}
	});
}

wss.on("connection", (ws) => {
	console.log("[WS] New connection");

	if (lastRawData) {
		try {
			ws.send(JSON.stringify(lastRawData));
		} catch {}
	}

	ws.on("message", (msg) => {
		try {
			const data = JSON.parse(msg.toString());
			lastRawData = data;

			broadcastToSiteClients(data, ws);
			updateActivity(data, globalConfig);
		} catch (e) {
			console.error("[WS] ❌ Error parsing data:", e);
		}
	});
});

function updateActivity(data, config) {
	if (!rpc || !isReady) return;

	const trackId = data.trackId || "";
	const title = data.title || "";
	const artist = data.artists || "";
	const img = data.img || "icon";
	const trackUrl = `https://music.yandex.ru/track/${trackId}` || "";
	const artistUrl = data.artistUrl || "";
	const nmUGCPlayerUrl = data.nmUGCPlayerUrl || "";

	const positionSec = data.positionSec ?? 0;
	const durationSec = data.durationSec ?? 0;
	const hasTimestamps = durationSec > 0 && positionSec > 0;

	const now = Math.floor(Date.now() / 1000);
	const startTimestamp = now - Math.floor(positionSec);
	const endTimestamp = startTimestamp + Math.floor(durationSec);

	const isUGCTrack = trackId.includes("-");

	const activityObject = {
		name: config?.programSettings?.richPresence?.rpcTitle || "Next Music",
		type: 2,
		details: title,
		state: artist,
		largeImageKey: img,
		largeImageUrl: GITHUB_LINK,
		statusDisplayType: 1,
		instance: false,
		...(trackUrl ? (isUGCTrack ? {} : { detailsUrl: trackUrl }) : {}),
		...(artistUrl ? { stateUrl: artistUrl } : {}),
		...(hasTimestamps ? { startTimestamp, endTimestamp } : {}),
		buttons: [
			...(config?.programSettings?.richPresence?.buttons?.trackButton && trackId
				? [
						{
							label: isUGCTrack ? "Open in UGC Player" : "Open in Yandex Music",
							url: isUGCTrack ? nmUGCPlayerUrl : trackUrl,
						},
					]
				: []),
			...(config?.programSettings?.richPresence?.buttons?.githubButton
				? [{ label: "Next Music Project", url: NM_WEBSITE_LINK }]
				: []),
		],
	};

	const playerState = (data.playerState || "").toLowerCase();

	if (playerState !== "playing") {
		if (lastPlayerState !== "pause") {
			console.log(`[RPC] Clearing activity (${playerState || "unknown"})`);
			rpc.user?.clearActivity().catch(console.error);
			lastPlayerState = "pause";
			lastActivity = null;
		}
		return;
	}

	const hasChanged =
		!lastActivity ||
		lastActivity.details !== activityObject.details ||
		lastActivity.state !== activityObject.state ||
		lastActivity.largeImageKey !== activityObject.largeImageKey ||
		lastPlayerState !== "play";

	const timestampDiff =
		lastActivity?.startTimestamp != null
			? Math.abs(activityObject.startTimestamp - lastActivity.startTimestamp)
			: Infinity;

	if (hasChanged) {
		console.log(`[RPC] Setting new activity: ${title} — ${artist}`);
		rpc.user?.setActivity(activityObject).catch(console.error);
		lastActivity = { ...activityObject };
		lastPlayerState = "play";
	} else if (hasTimestamps && timestampDiff > 1) {
		console.log(`[RPC] Updating timestamps for: ${title} — ${artist}`);

		rpc.user
			?.setActivity({ ...lastActivity, startTimestamp, endTimestamp })
			.catch(console.error);

		lastActivity.startTimestamp = startTimestamp;
		lastActivity.endTimestamp = endTimestamp;
	}
}

// Initialize Discord RPC if enabled
function presenceService(config) {
	globalConfig = config;
	initRPC();
}

export { initRPC, updateActivity, presenceService };
