let chatMessages = initial?.chatHistory ?? [];
const CHAT_HISTORY_CAP = 50;

const CHAT_TEXT_MAX_LEN = 2000;

function sendChatMessage(text) {
	const trimmed = (text || "").trim();
	if (!trimmed || trimmed.length > CHAT_TEXT_MAX_LEN) return;
	LA.sendChatMessage?.(trimmed);
}

LA.onChatHistory?.((msg) => {
	chatMessages = (msg?.messages ?? []).slice(-CHAT_HISTORY_CAP);
	renderPanel();
});

LA.onChatMessage?.((msg) => {
	if (!msg) return;
	chatMessages = [...chatMessages, msg].slice(-CHAT_HISTORY_CAP);
	renderPanel();
	notifyChatMessage(msg);
});

let chatNotifySound = null;
const NOTIFY_VOLUME_KEY = "nmc-la-notify-volume";

function getChatNotifyVolume() {
	const raw = Number.parseFloat(localStorage.getItem(NOTIFY_VOLUME_KEY));
	return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
}

function playChatNotifySound() {
	try {
		const volume = getChatNotifyVolume();
		if (volume <= 0) return;
		const port = window.__nextmusicApiAssetPort ?? 2007;
		if (!chatNotifySound) {
			chatNotifySound = new Audio(
				`http://127.0.0.1:${port}/app_asset/sounds/combobreak.mp3`,
			);
		}
		chatNotifySound.currentTime = 0;
		chatNotifySound.volume = volume;
		chatNotifySound.play().catch(() => {});
	} catch {}
}

function notifyChatMessage(msg) {
	if (!msg || msg.discordUserId === SELF_DISCORD_ID) return;
	if (_panelOpen) return;

	const api = window.nextmusicApi;
	const text = (msg.text || "").slice(0, 120);
	const author = islandAvatars.get(msg.discordUserId);
	const avatarUrl = author?.url || null;
	const name = author?.name || msg.discordUserId;

	api?.showToast?.(
		`${name}: ${text}`,
		api?.ContainerId?.INFO,
		{ position: "top-center" },
		avatarUrl,
	);

	playChatNotifySound();
}

const islandAvatars = new Map();

function buildAvatarList() {
	const hostId = connection.hostId;
	return [...islandAvatars.entries()]
		.sort(([a], [b]) => {
			if (a === hostId) return -1;
			if (b === hostId) return 1;
			return a < b ? -1 : a > b ? 1 : 0;
		})
		.map(([id, avatar]) => ({
			id,
			url: avatar.url,
			name: avatar.name || id,
			isHost: !!hostId && id === hostId,
			isSelf: id === SELF_DISCORD_ID,
		}));
}

function upsertAvatar(discordUserId, avatarUrl, name) {
	const prev = islandAvatars.get(discordUserId);
	islandAvatars.set(discordUserId, {
		url: avatarUrl || prev?.url || null,
		name: name || prev?.name || null,
	});
	renderPanel();
}

function removeAvatar(discordUserId) {
	islandAvatars.delete(discordUserId);
	renderPanel();
}

function clearAvatars() {
	islandAvatars.clear();
}
