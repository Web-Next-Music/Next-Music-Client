import { getConfig, patchConfig } from "../configManager.js";
import {
	getDiscordTokens,
	refreshDiscordTokens,
	fetchDiscordProfile,
} from "./discordAuth.js";

const EXPIRY_SAFETY_MS = 60000;

let profileCache = null;

function readIdentity() {
	return getConfig()?.discord ?? {};
}

export function hasDiscordIdentity() {
	const identity = readIdentity();
	return !!(identity.accessToken || identity.refreshToken);
}

export function getDiscordUsername() {
	return profileCache?.username || null;
}

export function getDiscordDisplayName() {
	return profileCache?.displayName || profileCache?.username || null;
}

export function getDiscordAvatarUrl() {
	return profileCache?.avatarUrl || null;
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
		patchConfig((c) => {
			c.discord = { ...c.discord, ...refreshed };
		});
		return refreshed.accessToken;
	} catch (err) {
		console.warn("[Discord Identity] Refresh failed:", err.message);
		return identity.accessToken || null;
	}
}

export async function ensureDiscordProfile() {
	if (profileCache) return profileCache;

	const accessToken = await getValidDiscordAccessToken();
	if (!accessToken) return null;

	try {
		const profile = await fetchDiscordProfile(accessToken);
		if (profile.username) profileCache = profile;
	} catch {}

	return profileCache;
}

export async function connectDiscordIdentity() {
	const { tokens, username, displayName, avatarUrl } =
		await getDiscordTokens();

	patchConfig((c) => {
		c.discord = { ...tokens };
	});

	profileCache = { username, displayName, avatarUrl };

	return { ok: true, username, displayName, avatarUrl };
}

export function disconnectDiscordIdentity() {
	patchConfig((c) => {
		c.discord = { accessToken: null, refreshToken: null, expiresAt: null };
	});

	profileCache = null;
}
