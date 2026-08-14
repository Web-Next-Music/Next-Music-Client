import { ipcMain, powerSaveBlocker, BrowserWindow } from "electron";
import WebSocket from "ws";
import { getConfig, saveConfig } from "../configManager.js";
import {
	getValidDiscordAccessToken,
	hasDiscordIdentity,
	getDiscordDisplayName,
	getDiscordAvatarUrl,
	ensureDiscordProfile,
} from "./discordIdentity.js";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 25000;

const CLOSE_ROOM_NOT_FOUND = 4001;
const CLOSE_KICKED = 4002;
const ROOM_RETRY_MS = 20000;

const HOST_ONLY_TYPES = new Set([
	"navigate",
	"playstate",
	"seek",
	"transfer_host",
	"queue_sync",
]);

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
let resolvedDiscordUserID = null;
let pendingDiscordAuth = null;
let pendingRoomList = null;
let pendingCreateRoom = null;
let pendingJoinRoom = null;

const roster = new Map();
let chatHistory = [];
const CHAT_HISTORY_CAP = 50;
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
	roomName: null,
	isHost: false,
	hostId: null,
	isCreator: false,
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
		discordSession: la.discordSession || "",
	};
}

function authToken() {
	return settings?.discordSession || "";
}

function serverLabel() {
	if (!settings?.host) return "";
	return settings.port ? `${settings.host}:${settings.port}` : settings.host;
}

function socketUrl() {
	const label = serverLabel();
	if (!label) return null;

	const params = new URLSearchParams();
	if (settings.roomId) params.set("room", settings.roomId);

	const query = params.toString();
	return `wss://${label}${query ? `?${query}` : ""}`;
}

function broadcast(channel, payload) {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win.isDestroyed()) continue;
		win.webContents.send(channel, payload);
	}
}

const internalStatusListeners = new Set();

export function onListenAlongStatus(cb) {
	internalStatusListeners.add(cb);
	return () => internalStatusListeners.delete(cb);
}

export function getListenAlongStatus() {
	return publicStatus();
}

function notifyInternal() {
	const snapshot = publicStatus();
	for (const cb of internalStatusListeners) {
		try {
			cb(snapshot);
		} catch {}
	}
}

function setStatus(patch) {
	status = { ...status, ...patch };
	broadcast("la:status", publicStatus());
	notifyInternal();
}

function publicStatus() {
	return {
		connected: status.connected,
		connecting: status.connecting,
		discordUserId: resolvedDiscordUserID,
		serverName: status.serverName,
		serverLabel: serverLabel(),
		roomId: settings?.roomId || null,
		roomName: status.roomName,
		isHost: status.isHost,
		hostId: status.hostId,
		isCreator: status.isCreator,
		fatal: status.fatal,
		discordLinked: hasDiscordIdentity(),
		peers: [...roster].map(([discordUserId, entry]) => ({
			discordUserId,
			...entry,
		})),
	};
}

function startPowerBlocker() {
	if (blockerId !== null) return;
	blockerId = powerSaveBlocker.start("prevent-app-suspension");
}

function stopPowerBlocker() {
	if (blockerId === null) return;
	if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
	blockerId = null;
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
			fatal: "no-server",
		});
		return;
	}

	setStatus({ connecting: true, fatal: null });

	ws = new WebSocket(url, { rejectUnauthorized: false });

	ws.on("open", () => {
		reconnectDelay = RECONNECT_MIN_MS;
		setStatus({ connected: true, connecting: false, fatal: null });

		const token = authToken();
		if (token) {
			send({ type: "auth", token });
			pushDiscordProfile();
		} else if (hasDiscordIdentity()) {
			discordSignIn().catch(() => {});
		}

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
			roster.set(msg.discordUserId, {
				name: msg.name || null,
				avatarUrl: msg.avatarUrl || null,
			});
			notifyInternal();
		} else if (msg.type === "client_left") {
			roster.delete(msg.discordUserId);
			notifyInternal();
		} else if (msg.type === "avatar") {
			const prev = roster.get(msg.discordUserId);
			roster.set(msg.discordUserId, {
				name: msg.name || prev?.name || null,
				avatarUrl: msg.avatarUrl || prev?.avatarUrl || null,
			});
			notifyInternal();
		} else if (msg.type === "room_renamed") {
			setStatus({ roomName: msg.roomName || null });
		} else if (msg.type === "room_left") {
			roster.clear();
			chatHistory = [];
			settings.roomId = "";
			const config = getConfig();
			const la = config?.alpha?.listenAlong ?? {};
			config.alpha.listenAlong = { ...la, roomId: "" };
			saveConfig(config);
			setStatus({
				isHost: false,
				hostId: null,
				isCreator: false,
				roomName: null,
			});
		}

		if (msg.type === "server_info") {
			if (msg.discordUserId) resolvedDiscordUserID = msg.discordUserId;
			if (msg.roomId) pushDiscordProfile();
			if (msg.roomId && msg.roomId !== settings.roomId) {
				settings.roomId = msg.roomId;
				const config = getConfig();
				const la = config?.alpha?.listenAlong ?? {};
				config.alpha.listenAlong = { ...la, roomId: msg.roomId };
				saveConfig(config);
			}

			setStatus({
				serverName: msg.name || null,
				roomName: msg.roomName || null,
				hostId: msg.hostId || null,
			});

			if (pendingJoinRoom && msg.roomId === pendingJoinRoom.roomId) {
				pendingJoinRoom.resolve({ ok: true, roomId: msg.roomId });
				pendingJoinRoom = null;
			}
		} else if (msg.type === "auth_result") {
			if (!msg.ok)
				console.warn("[ListenAlong] Auth rejected:", msg.message);
			setStatus({ isHost: !!msg.isHost, isCreator: !!msg.isCreator });
			if (pendingCreateRoom) {
				const { resolve } = pendingCreateRoom;
				pendingCreateRoom = null;
				resolve(msg);
			}
			if (!msg.ok && pendingJoinRoom) {
				pendingJoinRoom.resolve({ ok: false, reason: msg.message });
				pendingJoinRoom = null;
			}
		} else if (msg.type === "error") {
			console.warn("[ListenAlong] Server error:", msg.code, msg.message);
			if (pendingJoinRoom) {
				pendingJoinRoom.resolve({ ok: false, reason: msg.message });
				pendingJoinRoom = null;
			}
		} else if (msg.type === "host_changed") {
			const hostId = msg.hostId || null;
			setStatus({
				hostId,
				isHost: !!hostId && hostId === effectiveDiscordUserID(),
			});
		} else if (msg.type === "chat_message") {
			if (msg.roomId && msg.roomId !== settings.roomId) return;
			chatHistory = [...chatHistory, msg].slice(-CHAT_HISTORY_CAP);
			broadcast("la:chat-message", msg);
		} else if (msg.type === "chat_history") {
			chatHistory = (msg.messages ?? []).slice(-CHAT_HISTORY_CAP);
			broadcast("la:chat-history", msg);
		} else if (msg.type === "discord_auth_result") {
			if (pendingDiscordAuth) {
				const { resolve } = pendingDiscordAuth;
				pendingDiscordAuth = null;
				if (msg.ok) resolve({ ok: true, token: msg.token });
				else resolve({ ok: false, reason: msg.message });
			}
		} else if (msg.type === "room_list") {
			if (pendingRoomList) {
				pendingRoomList.resolve(msg.rooms ?? []);
				pendingRoomList = null;
			}
		}

		broadcast("la:message", msg);
	});

	ws.on("close", (code, reason) => {
		console.warn(
			`[ListenAlong] Disconnected (${code}${reason ? `: ${reason}` : ""})`,
		);

		ws = null;
		roster.clear();
		chatHistory = [];
		clearInterval(pingTimer);
		pingTimer = null;
		stopPowerBlocker();

		if (pendingDiscordAuth) {
			pendingDiscordAuth.resolve({
				ok: false,
				reason: "Disconnected during sign-in",
			});
			pendingDiscordAuth = null;
		}
		if (pendingRoomList) {
			pendingRoomList.resolve([]);
			pendingRoomList = null;
		}
		if (pendingCreateRoom) {
			pendingCreateRoom.resolve({ ok: false });
			pendingCreateRoom = null;
		}
		if (pendingJoinRoom) {
			pendingJoinRoom.resolve({ ok: false, reason: "Disconnected" });
			pendingJoinRoom = null;
		}

		const roomMissing = code === CLOSE_ROOM_NOT_FOUND;
		const kicked = code === CLOSE_KICKED;
		setStatus({
			connected: false,
			connecting: false,
			isHost: false,
			hostId: null,
			isCreator: false,
			fatal: roomMissing ? "room-not-found" : kicked ? "kicked" : null,
		});

		if (roomMissing) reconnectDelay = ROOM_RETRY_MS;

		if (kicked) {
			manuallyDisconnected = true;
		} else {
			scheduleReconnect();
		}
	});

	ws.on("error", (err) => {
		console.warn("[ListenAlong] Socket error:", err.message);
	});
}

function close() {
	clearTimers();
	stopPowerBlocker();
	roster.clear();
	chatHistory = [];

	if (pendingDiscordAuth) {
		pendingDiscordAuth.resolve({
			ok: false,
			reason: "Disconnected during sign-in",
		});
		pendingDiscordAuth = null;
	}
	if (pendingRoomList) {
		pendingRoomList.resolve([]);
		pendingRoomList = null;
	}
	if (pendingCreateRoom) {
		pendingCreateRoom.resolve({ ok: false });
		pendingCreateRoom = null;
	}

	if (ws) {
		const socket = ws;
		ws = null;
		socket.on("error", () => {});
		try {
			socket.close(1000, "client disconnect");
		} catch {}
		process.nextTick(() => socket.removeAllListeners());
	}

	setStatus({
		connected: false,
		connecting: false,
		isHost: false,
		hostId: null,
		isCreator: false,
		fatal: null,
	});
}

function effectiveDiscordUserID() {
	return resolvedDiscordUserID;
}

function waitUntil(predicate, timeoutMs) {
	if (predicate()) return Promise.resolve(true);
	return new Promise((resolve) => {
		const start = Date.now();
		const timer = setInterval(() => {
			if (predicate()) {
				clearInterval(timer);
				resolve(true);
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(timer);
				resolve(false);
			}
		}, 100);
	});
}

async function pushDiscordProfile() {
	await ensureDiscordProfile();
	const url = getDiscordAvatarUrl();
	const name = getDiscordDisplayName() || "";
	if (!url && !name) return;
	send({
		type: "avatar_url",
		url: url || "",
		name,
	});
}

async function discordSignIn() {
	if (ws?.readyState !== WebSocket.OPEN) {
		return { ok: false, reason: "Connect to a server first" };
	}
	if (pendingDiscordAuth) {
		return { ok: false, reason: "Sign-in already in progress" };
	}

	const accessToken = await getValidDiscordAccessToken();
	if (!accessToken) {
		return {
			ok: false,
			reason: "Sign in with Discord in Settings first",
		};
	}

	try {
		const result = await new Promise((resolve) => {
			pendingDiscordAuth = { resolve };
			send({ type: "discord_token", accessToken });
		});

		if (result.ok) {
			const config = getConfig();
			const la = config?.alpha?.listenAlong ?? {};
			config.alpha.listenAlong = {
				...la,
				discordSession: result.token,
			};
			saveConfig(config);
			settings = readSettings();
			pushDiscordProfile();
		}

		return result;
	} catch (err) {
		pendingDiscordAuth = null;
		console.warn("[ListenAlong] Discord sign-in failed:", err.message);
		return { ok: false, reason: err.message };
	}
}

export function refreshDiscordIdentity() {
	if (ws?.readyState === WebSocket.OPEN) {
		if (!authToken() && hasDiscordIdentity()) {
			discordSignIn().catch(() => {});
		} else {
			pushDiscordProfile();
		}
	}
	setStatus({});
}

function registerIpc() {
	if (!ipcMain.listenerCount("la:get-config")) {
		ipcMain.handle("la:get-config", () => ({
			enable: !!settings?.enable,
			blackIsland: !!settings?.blackIsland,
			roomId: settings?.roomId || "",
			chatHistory,
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

	if (!ipcMain.listenerCount("la:discord-signin")) {
		ipcMain.handle("la:discord-signin", () => discordSignIn());
	}

	if (!ipcMain.listenerCount("la:create-room")) {
		ipcMain.handle("la:create-room", async (_event, name) => {
			if (!hasDiscordIdentity()) {
				return {
					ok: false,
					reason: "Sign in with Discord in Settings first",
				};
			}

			if (ws?.readyState !== WebSocket.OPEN) {
				const config = getConfig();
				const la = config?.alpha?.listenAlong ?? {};
				config.alpha.listenAlong = { ...la, enable: true };
				saveConfig(config);

				manuallyDisconnected = false;
				settings = readSettings();
				reconnectDelay = RECONNECT_MIN_MS;
				clearTimers();
				close();
				open();

				const connected = await waitUntil(() => status.connected, 8000);
				if (!connected) {
					return {
						ok: false,
						reason: "Could not connect to the server",
					};
				}
			}

			if (!authToken()) {
				const signIn = await discordSignIn();
				if (!signIn.ok) return signIn;
			}

			if (pendingCreateRoom) {
				return { ok: false, reason: "Already creating a room" };
			}

			const result = await new Promise((resolve) => {
				pendingCreateRoom = { resolve };
				chatHistory = [];
				broadcast("la:chat-history", { messages: [] });
				send({ type: "create_room", name: String(name || "").trim() });
				setTimeout(() => {
					if (pendingCreateRoom) {
						pendingCreateRoom = null;
						resolve({ ok: false });
					}
				}, 5000);
			});

			if (!result.ok) {
				return {
					ok: false,
					reason: result.message || "Could not create room",
				};
			}

			await waitUntil(() => !!settings.roomId, 3000);
			return { ok: true, roomId: settings.roomId || null };
		});
	}

	if (!ipcMain.listenerCount("la:leave-room")) {
		ipcMain.handle("la:leave-room", () => {
			if (ws?.readyState !== WebSocket.OPEN || !settings.roomId) {
				return { ok: false };
			}
			send({ type: "leave_room" });
			return { ok: true };
		});
	}

	if (!ipcMain.listenerCount("la:set-room-name")) {
		ipcMain.on("la:set-room-name", (_event, name) => {
			send({ type: "set_room_name", name: String(name || "").trim() });
		});
	}

	if (!ipcMain.listenerCount("la:list-rooms")) {
		ipcMain.handle("la:list-rooms", async () => {
			if (!settings?.host) {
				return { ok: false, reason: "Set a server address first" };
			}
			if (pendingRoomList) {
				return { ok: false, reason: "Already listing rooms" };
			}

			if (ws?.readyState !== WebSocket.OPEN) {
				return { ok: false, reason: "Not connected to the server" };
			}

			const rooms = await new Promise((resolve) => {
				pendingRoomList = { resolve };
				send({ type: "list_rooms" });
				setTimeout(() => {
					if (pendingRoomList) {
						pendingRoomList = null;
						resolve([]);
					}
				}, 5000);
			});

			return { ok: true, rooms };
		});
	}

	if (!ipcMain.listenerCount("la:join-room")) {
		ipcMain.handle("la:join-room", async (_event, roomId) => {
			if (!roomId) return { ok: false, reason: "No room id given" };

			if (ws?.readyState !== WebSocket.OPEN) {
				const config = getConfig();
				const la = config?.alpha?.listenAlong ?? {};
				config.alpha.listenAlong = { ...la, enable: true };
				saveConfig(config);

				manuallyDisconnected = false;
				settings = readSettings();
				reconnectDelay = RECONNECT_MIN_MS;
				clearTimers();
				close();
				open();

				const connected = await waitUntil(() => status.connected, 8000);
				if (!connected) {
					return {
						ok: false,
						reason: "Could not connect to the server",
					};
				}
			}

			if (pendingJoinRoom) {
				return { ok: false, reason: "Already joining a room" };
			}

			const result = await new Promise((resolve) => {
				pendingJoinRoom = { roomId, resolve };
				chatHistory = [];
				broadcast("la:chat-history", { messages: [] });
				send({ type: "join_room", targetId: roomId });
				setTimeout(() => {
					if (pendingJoinRoom) {
						pendingJoinRoom = null;
						resolve({
							ok: false,
							reason: "Timed out joining the room",
						});
					}
				}, 5000);
			});

			if (result.ok) {
				const config = getConfig();
				const la = config?.alpha?.listenAlong ?? {};
				config.alpha.listenAlong = { ...la, roomId };
				saveConfig(config);
			}

			return result;
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
		previous?.roomId !== settings.roomId;

	if (endpointChanged || !ws) {
		manuallyDisconnected = false;
		close();
		reconnectDelay = RECONNECT_MIN_MS;
		open();
		return;
	}

	if (previous?.discordSession !== settings.discordSession) {
		const token = authToken();
		if (token) {
			send({ type: "auth", token });
			pushDiscordProfile();
		}
	}
}
