import { ipcMain, powerSaveBlocker, BrowserWindow } from "electron";
import WebSocket from "ws";
import { getConfig, saveConfig } from "../configManager.js";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 25000;

const CLOSE_ROOM_NOT_FOUND = 4001;
const ROOM_RETRY_MS = 20000;

const HOST_ONLY_TYPES = new Set(["navigate", "playstate", "seek"]);

const INVITE_PREFIX = "NMJ-";

function buildInvite() {
	if (!settings?.host || !settings?.roomId) return null;

	const payload = JSON.stringify({
		h: settings.host,
		p: settings.port || "",
		r: settings.roomId,
	});

	return INVITE_PREFIX + Buffer.from(payload, "utf8").toString("base64url");
}

export function buildInviteUrl() {
	const code = buildInvite();
	return code ? `nextmusic://connect/${code}` : null;
}

function parseInvite(code) {
	if (typeof code !== "string") return null;

	const trimmed = code.trim();
	if (!trimmed.startsWith(INVITE_PREFIX)) return null;

	try {
		const json = Buffer.from(
			trimmed.slice(INVITE_PREFIX.length),
			"base64url",
		).toString("utf8");
		const data = JSON.parse(json);

		const host = String(data.h ?? "").trim();
		const roomId = String(data.r ?? "").trim();
		if (!host || !roomId) return null;

		return { host, port: String(data.p ?? "").trim(), roomId };
	} catch {
		return null;
	}
}

export function joinByInvite(code) {
	const invite = parseInvite(code) ?? parseInvite(inviteCodeFromUrl(code));
	if (!invite) return { ok: false, reason: "bad-code" };

	const config = getConfig();
	const la = (config.alpha ??= {}).listenAlong ?? {};

	config.alpha.listenAlong = {
		...la,
		enable: true,
		host: invite.host,
		port: invite.port,
		roomId: invite.roomId,
		hostToken: "",
	};

	saveConfig(config);
	refreshListenAlong();

	return { ok: true, ...invite };
}

const INVITE_ROUTES = new Set(["connect", "join"]);
export function inviteCodeFromUrl(url) {
	if (typeof url !== "string") return null;

	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	if (parsed.protocol !== "nextmusic:") return null;

	const segments = [parsed.hostname, ...parsed.pathname.split("/")]
		.map((part) => part.trim())
		.filter(Boolean);

	if (!INVITE_ROUTES.has(segments[0])) return null;

	const code = decodeURIComponent(segments[1] ?? "");
	return code.startsWith(INVITE_PREFIX) ? code : null;
}

let ws = null;
let settings = null;
let resolvedClientId = null;

const roster = new Map();
let manuallyDisconnected = false;
let reconnectTimer = null;
let reconnectDelay = RECONNECT_MIN_MS;
let pingTimer = null;
let blockerId = null;
let rttMs = 0;
let pingSentAt = 0;

let status = {
	connected: false,
	connecting: false,
	serverName: null,
	isHost: false,
	hostId: null,
	fatal: null,
};

function readSettings() {
	const config = getConfig();
	const la = config?.alpha?.listenAlong ?? {};

	return {
		enable: !!la.enable,
		blackIsland: !!la.blackIsland,
		host: la.host || "",
		port: la.port || "",
		roomId: la.roomId || "",
		clientId: la.clientId || "",
		hostToken: la.hostToken || "",
	};
}

function serverLabel() {
	if (!settings?.host) return "";
	return settings.port ? `${settings.host}:${settings.port}` : settings.host;
}

function socketUrl() {
	const label = serverLabel();
	if (!label || !settings.roomId) return null;

	if (!resolvedClientId || settings.clientId) {
		resolvedClientId =
			settings.clientId ||
			`user_${Math.random().toString(36).slice(2, 7)}`;
	}

	const params = new URLSearchParams({
		room: settings.roomId,
		clientId: resolvedClientId,
	});

	return `wss://${label}?${params.toString()}`;
}

function broadcast(channel, payload) {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		win.webContents.send(channel, payload);
	}
}

function setStatus(patch) {
	status = { ...status, ...patch };
	broadcast("la:status", publicStatus());
}

function publicStatus() {
	return {
		connected: status.connected,
		connecting: status.connecting,
		clientId: resolvedClientId,
		serverName: status.serverName,
		serverLabel: serverLabel(),
		isHost: status.isHost,
		hostId: status.hostId,
		fatal: status.fatal,
	};
}

function startPowerBlocker() {
	if (blockerId !== null) return;
	blockerId = powerSaveBlocker.start("prevent-app-suspension");
	console.log("[ListenAlong] Power save blocker started");
}

function stopPowerBlocker() {
	if (blockerId === null) return;
	if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
	blockerId = null;
	console.log("[ListenAlong] Power save blocker stopped");
}

function clearTimers() {
	clearTimeout(reconnectTimer);
	reconnectTimer = null;
	clearInterval(pingTimer);
	pingTimer = null;
}

function scheduleReconnect() {
	if (manuallyDisconnected || reconnectTimer) return;

	const jitter = Math.random() * 0.3 * reconnectDelay;
	const delay = Math.round(reconnectDelay + jitter);

	console.log(`[ListenAlong] Reconnecting in ${delay}ms`);
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		open();
	}, delay);

	reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function send(message) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return false;
	try {
		ws.send(JSON.stringify(message));
		return true;
	} catch (err) {
		console.warn("[ListenAlong] Send failed:", err.message);
		return false;
	}
}

function open() {
	if (ws) return;

	settings = readSettings();

	const url = socketUrl();
	if (!url) {
		setStatus({
			connected: false,
			connecting: false,
			fatal: !serverLabel() ? "no-server" : "no-room",
		});
		return;
	}

	setStatus({ connecting: true, fatal: null });

	ws = new WebSocket(url, { rejectUnauthorized: false });

	ws.on("open", () => {
		console.log(`[ListenAlong] Connected to ${serverLabel()}`);
		reconnectDelay = RECONNECT_MIN_MS;
		setStatus({ connected: true, connecting: false, fatal: null });

		if (settings.hostToken)
			send({ type: "auth", token: settings.hostToken });

		startPowerBlocker();

		pingSentAt = Date.now();
		ws.ping();

		pingTimer = setInterval(() => {
			if (ws?.readyState !== WebSocket.OPEN) return;
			pingSentAt = Date.now();
			ws.ping();
		}, PING_INTERVAL_MS);
	});

	ws.on("pong", () => {
		if (!pingSentAt) return;
		rttMs = Date.now() - pingSentAt;
		pingSentAt = 0;
	});

	ws.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw.toString());
		} catch {
			return;
		}

		if (msg.type === "state_sync") {
			msg.serverTime = Date.now() - Math.round(rttMs / 2);
		}

		if (msg.type === "client_joined") {
			roster.set(msg.clientId, {
				avatar: msg.avatar || null,
				mime: msg.mime || null,
			});
		} else if (msg.type === "client_left") {
			roster.delete(msg.clientId);
		} else if (msg.type === "avatar") {
			roster.set(msg.clientId, {
				avatar: msg.data || null,
				mime: msg.mime || null,
			});
		}

		if (msg.type === "server_info") {
			if (msg.clientId) resolvedClientId = msg.clientId;

			setStatus({
				serverName: msg.name || null,
				hostId: msg.hostId || null,
			});
		} else if (msg.type === "auth_result") {
			if (!msg.ok)
				console.warn("[ListenAlong] Auth rejected:", msg.message);
			setStatus({ isHost: !!msg.isHost });
		} else if (msg.type === "host_changed") {
			const hostId = msg.hostId || null;
			setStatus({
				hostId,
				isHost: !!hostId && hostId === effectiveClientId(),
			});
		}

		broadcast("la:message", msg);
	});

	ws.on("close", (code, reason) => {
		console.warn(
			`[ListenAlong] Disconnected (${code}${reason ? `: ${reason}` : ""})`,
		);

		ws = null;
		roster.clear();
		clearInterval(pingTimer);
		pingTimer = null;
		stopPowerBlocker();

		const roomMissing = code === CLOSE_ROOM_NOT_FOUND;
		setStatus({
			connected: false,
			connecting: false,
			isHost: false,
			hostId: null,
			fatal: roomMissing ? "room-not-found" : null,
		});

		if (roomMissing) reconnectDelay = ROOM_RETRY_MS;

		scheduleReconnect();
	});

	ws.on("error", (err) => {
		console.warn("[ListenAlong] Socket error:", err.message);
	});
}

function close() {
	clearTimers();
	stopPowerBlocker();
	roster.clear();

	if (ws) {
		const socket = ws;
		ws = null;
		try {
			socket.close(1000, "client disconnect");
		} catch {}
		socket.removeAllListeners();
	}

	setStatus({
		connected: false,
		connecting: false,
		isHost: false,
		hostId: null,
		fatal: null,
	});
}

function effectiveClientId() {
	return resolvedClientId;
}

function registerIpc() {
	if (!ipcMain.listenerCount("la:get-config")) {
		ipcMain.handle("la:get-config", () => ({
			enable: !!settings?.enable,
			blackIsland: !!settings?.blackIsland,
			roomId: settings?.roomId || "",
			clientId: resolvedClientId || settings?.clientId || "",
			peers: [...roster].map(([clientId, entry]) => ({
				clientId,
				...entry,
			})),
			...publicStatus(),
		}));
	}

	if (!ipcMain.listenerCount("la:invite")) {
		ipcMain.handle("la:invite", () => buildInviteUrl());
	}

	if (!ipcMain.listenerCount("la:join")) {
		ipcMain.handle("la:join", (_event, code) => joinByInvite(code));
	}

	if (!ipcMain.listenerCount("la:connect")) {
		ipcMain.handle("la:connect", () => {
			manuallyDisconnected = false;
			reconnectDelay = RECONNECT_MIN_MS;
			clearTimers();
			if (!ws) open();
			return publicStatus();
		});
	}

	if (!ipcMain.listenerCount("la:disconnect")) {
		ipcMain.handle("la:disconnect", () => {
			manuallyDisconnected = true;
			close();
			return publicStatus();
		});
	}

	if (!ipcMain.listenerCount("la:send")) {
		ipcMain.on("la:send", (_event, message) => {
			if (!message || typeof message.type !== "string") return;

			if (!HOST_ONLY_TYPES.has(message.type)) {
				send(message);
				return;
			}

			if (!status.isHost) return;

			send(message);
		});
	}
}

export function startListenAlong() {
	settings = readSettings();
	registerIpc();

	if (!settings.enable) return;

	manuallyDisconnected = false;
	open();
}

export function stopListenAlong() {
	manuallyDisconnected = true;
	close();
}

export function refreshListenAlong() {
	const previous = settings;
	settings = readSettings();

	if (!settings.enable) {
		stopListenAlong();
		return;
	}

	const endpointChanged =
		previous?.host !== settings.host ||
		previous?.port !== settings.port ||
		previous?.roomId !== settings.roomId ||
		previous?.clientId !== settings.clientId;

	if (endpointChanged || !ws) {
		manuallyDisconnected = false;
		close();
		reconnectDelay = RECONNECT_MIN_MS;
		open();
		return;
	}

	if (previous?.hostToken !== settings.hostToken) {
		send({ type: "auth", token: settings.hostToken });
	}
}
