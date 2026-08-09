import { getConfig, saveConfig } from "../configManager.js";
import { getDiscordTokens, refreshDiscordTokens } from "./discordAuth.js";

const EXPIRY_SAFETY_MS = 60000;

function readIdentity() {
	return getConfig()?.discord ?? {};
}

export function hasDiscordIdentity() {
	const identity = readIdentity();
	return !!(identity.accessToken || identity.refreshToken);
}

export function getDiscordUsername() {
	return readIdentity().username || null;
}

export function getDiscordAvatarUrl() {
	return readIdentity().avatarUrl || null;
}

export async function getValidDiscordAccessToken() {
	const identity = readIdentity();
	if (!identity.accessToken && !identity.refreshToken) return null;

	if (
		identity.accessToken &&
		identity.expiresAt &&
		identity.expiresAt > Date.now() + EXPIRY_SAFETY_MS
	) {
		return identity.accessToken;
	}

	if (!identity.refreshToken) return identity.accessToken || null;

	try {
		const refreshed = await refreshDiscordTokens(identity.refreshToken);
		const config = getConfig();
		config.discord = { ...config.discord, ...refreshed };
		saveConfig(config);
		return refreshed.accessToken;
	} catch (err) {
		console.warn("[Discord Identity] Refresh failed:", err.message);
		return identity.accessToken || null;
	}
}

function defaultDiscordAvatarUrl(user) {
	const index =
		user.discriminator && user.discriminator !== "0"
			? Number(user.discriminator) % 5
			: Number((BigInt(user.id) >> 22n) % 6n);

	return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function fetchAndCacheDiscordProfile(accessToken) {
	let username = null;
	let avatarUrl = null;
	try {
		const res = await fetch("https://discord.com/api/users/@me", {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (res.ok) {
			const user = await res.json();
			username = user.username || null;
			avatarUrl = user.avatar
				? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
				: defaultDiscordAvatarUrl(user);
			const config = getConfig();
			config.discord = {
				...config.discord,
				username,
				avatarUrl,
			};
			saveConfig(config);
		}
	} catch {}

	return { username, avatarUrl };
}

export async function ensureDiscordProfile() {
	const accessToken = await getValidDiscordAccessToken();
	if (!accessToken) return;

	await fetchAndCacheDiscordProfile(accessToken);
}

export async function connectDiscordIdentity() {
	const tokens = await getDiscordTokens();
	const config = getConfig();
	config.discord = { ...tokens, username: null };
	saveConfig(config);

	const { username, avatarUrl } = await fetchAndCacheDiscordProfile(
		tokens.accessToken,
	);

	return { ok: true, username, avatarUrl };
}

export function disconnectDiscordIdentity() {
	const config = getConfig();
	config.discord = {
		accessToken: null,
		refreshToken: null,
		expiresAt: null,
		username: null,
		avatarUrl: null,
	};
	saveConfig(config);
}
