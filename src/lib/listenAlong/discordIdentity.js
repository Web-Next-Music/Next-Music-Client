import { getConfig, saveConfig } from "../configManager.js";
import {
	getDiscordTokens,
	refreshDiscordTokens,
	fetchDiscordProfile,
} from "./discordAuth.js";

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

function cacheDiscordProfile(username, avatarUrl) {
	const config = getConfig();
	config.discord = { ...config.discord, username, avatarUrl };
	saveConfig(config);
}

export async function ensureDiscordProfile() {
	const accessToken = await getValidDiscordAccessToken();
	if (!accessToken) return;

	try {
		const { username, avatarUrl } = await fetchDiscordProfile(accessToken);
		if (username) cacheDiscordProfile(username, avatarUrl);
	} catch {}
}

export async function connectDiscordIdentity() {
	const { tokens, username, avatarUrl } = await getDiscordTokens();
	const config = getConfig();
	config.discord = { ...tokens, username, avatarUrl };
	saveConfig(config);

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
