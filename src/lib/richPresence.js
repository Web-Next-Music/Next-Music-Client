import { Client } from "@xhayper/discord-rpc";
import WebSocket from "ws";
import { loadConfig } from "./configManager.js";
import { checkGitHubStar } from "./githubStarAuth.js";

const CLIENT_ID = "1300258490815741952";
const GITHUB_LINK = `https://github.com/Web-Next-Music/Next-Music-Client`;
const NM_WEBSITE_LINK = `https://nm.diram1x.ru`;
const WSPORT = 6972;

let rpc;
let isReady = false;
let lastActivity = null;
let lastPlayerState = null;

// Star flag
let userHasStarred = false;
let lastStarCheckAt = 0;
let lastStarCheckToken = null;
let starCheckPromise = null;

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
			updateActivity(data);
		} catch (e) {
			console.error("[WS] ❌ Error parsing data:", e);
		}
	});
});

function clearActivity(reason = "unknown") {
	if (lastPlayerState !== "pause") {
		console.log(`[RPC] Clearing activity (${reason})`);
		rpc.user?.clearActivity().catch(console.error);
		lastPlayerState = "pause";
		lastActivity = null;
	}
}

function refreshGitHubStarState(config) {
	const accessToken = config?.github?.accessToken ?? null;

	if (!accessToken) {
		lastStarCheckToken = null;
		lastStarCheckAt = 0;
		userHasStarred = false;
		return;
	}

	const tokenChanged = accessToken !== lastStarCheckToken;
	const checkExpired = Date.now() - lastStarCheckAt > 5 * 60 * 1000;

	if (!tokenChanged && !checkExpired) return;
	if (starCheckPromise) return;

	lastStarCheckToken = accessToken;
	lastStarCheckAt = Date.now();

	starCheckPromise = checkGitHubStar()
		.then(({ hasStarred }) => {
			const hasChanged = userHasStarred !== hasStarred;
			userHasStarred = hasStarred;
			if (hasChanged && lastRawData) updateActivity(lastRawData);
		})
		.catch(() => {
			userHasStarred = false;
			if (lastRawData) updateActivity(lastRawData);
		})
		.finally(() => {
			starCheckPromise = null;
		});
}

function updateActivity(data) {
	if (!rpc || !isReady) return;
	const config = loadConfig();
	refreshGitHubStarState(config);

	if (!config?.programSettings?.richPresence?.enable) {
		clearActivity("disabled");
		return;
	}

	const trackId = data.trackId || "";
	const title = data.title || "";
	const artist = data.artists || "";
	const img = data.img || "icon";
	const trackUrl = `https://music.yandex.ru/track/${trackId}` || "";
	const artistUrl = data.artistUrl || "";
	// mp3Url: from siteRPCServer.js
	const mp3Url = data.mp3Url || data.trackUrl || "";

	const isUGCTrack = trackId.includes("-");
	const nmUGCPlayerUrl = data.nmUGCPlayerUrl || "";

	const positionSec = data.positionSec ?? 0;
	const durationSec = data.durationSec ?? 0;
	const hasTimestamps = durationSec > 0 && positionSec > 0;

	const now = Math.floor(Date.now() / 1000);
	const startTimestamp = now - Math.floor(positionSec);
	const endTimestamp = startTimestamp + Math.floor(durationSec);

	const { trackButton, githubButton } =
		config?.programSettings?.richPresence?.buttons ?? {};

	const isUGCShareEnabled = config?.programSettings?.ugcShare;

	const rpcTitleRaw = config?.programSettings?.richPresence?.rpcTitle;
	const rpcTitle = userHasStarred ? rpcTitleRaw : null;

	if (rpcTitleRaw && !userHasStarred) {
		console.log("[RPC] rpcTitle ignored — user has not starred the repo");
	}

	const configLargeImageUrl =
		config?.programSettings?.richPresence?.largeImageUrl;
	const resolvedLargeImageUrl = userHasStarred
		? configLargeImageUrl || undefined
		: GITHUB_LINK;

	const trackButtonLabel =
		isUGCTrack && isUGCShareEnabled
			? "Open in UGC player"
			: "Open in Yandex Music";

	const trackButtonUrl =
		isUGCTrack && isUGCShareEnabled ? nmUGCPlayerUrl : trackUrl;

	const detailsUrlField =
		trackUrl && !isUGCTrack ? { detailsUrl: trackUrl } : {};

	let showGithubButton;
	if (!userHasStarred) {
		showGithubButton = true;
	} else {
		showGithubButton = githubButton;
	}

	if (githubButton && !userHasStarred) {
		console.log("[RPC] GitHub button ignored — user has not starred the repo");
	}

	const activityObject = {
		name: rpcTitle || "Next Music",
		type: 2,
		details: title,
		state: artist,
		largeImageKey: img,
		...(resolvedLargeImageUrl ? { largeImageUrl: resolvedLargeImageUrl } : {}),
		statusDisplayType: 1,
		instance: false,
		...detailsUrlField,
		...(artistUrl ? { stateUrl: artistUrl } : {}),
		...(hasTimestamps ? { startTimestamp, endTimestamp } : {}),
		buttons: [
			...(trackButton && trackId && (!isUGCTrack || isUGCShareEnabled)
				? [{ label: trackButtonLabel, url: trackButtonUrl }]
				: []),
			...(showGithubButton
				? [{ label: "Next Music Project", url: NM_WEBSITE_LINK }]
				: []),
		],
	};

	const playerState = (data.playerState || "").toLowerCase();

	if (playerState !== "playing") {
		clearActivity(playerState || "unknown");
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
		const msg = `[RPC] Setting new activity: ${title} — ${artist}`;
		console.log(msg, { isUGCTrack, buttons: activityObject.buttons });
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

function presenceService(hasStarred = false) {
	userHasStarred = hasStarred;

	console.log(
		`[RPC] Repo star: ${userHasStarred ? "✔ premium features enabled" : "❌ premium features disabled"}`,
	);

	initRPC();
}

export { initRPC, updateActivity, presenceService };
