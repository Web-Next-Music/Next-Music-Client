import { shell } from "electron";
import { loadConfig, saveConfig } from "./configManager.js";

// Config

const GITHUB_CLIENT_ID = "Iv23licUeSGfgqPve80k";
const REPO_OWNER = "Web-Next-Music";
const REPO_NAME = "Next-Music-Client";

// Utils

async function refreshAccessToken(refreshToken) {
	const res = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: GITHUB_CLIENT_ID,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});

	const data = await res.json();
	if (data.error) {
		throw new Error(`Token refresh failed: ${data.error}`);
	}

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token || refreshToken,
		expiresAt: Date.now() + (data.expires_in || 28800) * 1000,
	};
}

async function checkRepoStarred(accessToken) {
	const res = await fetch(
		`https://api.github.com/user/starred/${REPO_OWNER}/${REPO_NAME}`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);

	if (res.status === 401) throw new Error("401");
	return res.status === 204;
}

// Device Flow

async function requestDeviceCodes() {
	const res = await fetch("https://github.com/login/device/code", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			client_id: GITHUB_CLIENT_ID,
			scope: "offline_access",
		}),
	});

	const data = await res.json();
	if (!data.device_code) {
		throw new Error(`Device code request failed: ${JSON.stringify(data)}`);
	}
	return data;
}

async function pollForToken(deviceCode, intervalSec, expiresIn, onProgress) {
	const deadline = Date.now() + expiresIn * 1000;
	const pollMs = Math.max(intervalSec, 5) * 1000;

	return new Promise((resolve, reject) => {
		const tick = async () => {
			if (Date.now() >= deadline) {
				reject(new Error("expired"));
				return;
			}

			onProgress?.(Math.max(0, Math.round((deadline - Date.now()) / 1000)));

			try {
				const res = await fetch("https://github.com/login/oauth/access_token", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({
						client_id: GITHUB_CLIENT_ID,
						device_code: deviceCode,
						grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					}),
				});

				const data = await res.json();

				if (data.access_token) {
					resolve({
						accessToken: data.access_token,
						refreshToken: data.refresh_token || null,
						expiresAt: Date.now() + (data.expires_in || 28800) * 1000,
					});
					return;
				}

				switch (data.error) {
					case "authorization_pending":
						setTimeout(tick, pollMs);
						break;
					case "slow_down":
						setTimeout(tick, pollMs + 5000);
						break;
					case "expired_token":
						reject(new Error("expired"));
						break;
					case "access_denied":
						reject(new Error("access_denied"));
						break;
					default:
						reject(new Error(data.error || "unknown_poll_error"));
				}
			} catch (err) {
				reject(err);
			}
		};

		setTimeout(tick, pollMs);
	});
}

// Default export

export async function checkGitHubStar() {
	const config = loadConfig();
	const github = config.github ?? {};
	const accessToken = github.accessToken ?? null;
	const refreshToken = github.refreshToken ?? null;

	if (!accessToken) {
		console.log("[GitHub Auth] No token found");
		return { hasStarred: false };
	}

	try {
		const hasStarred = await checkRepoStarred(accessToken);
		console.log(`[GitHub Auth] Star: ${hasStarred ? "✔" : "❌"}`);
		return { hasStarred };
	} catch (err) {
		if (err.message === "401" && refreshToken) {
			console.warn("[GitHub Auth] Token expired, attempting refresh...");
			try {
				const refreshed = await refreshAccessToken(refreshToken);
				config.github = {
					accessToken: refreshed.accessToken,
					refreshToken: refreshed.refreshToken,
					expiresAt: refreshed.expiresAt,
				};
				saveConfig(config);
				console.log("[GitHub Auth] Token refreshed successfully");

				const hasStarred = await checkRepoStarred(refreshed.accessToken);
				console.log(`[GitHub Auth] Star: ${hasStarred ? "✔" : "❌"}`);
				return { hasStarred };
			} catch (refreshErr) {
				console.error("[GitHub Auth] Token refresh failed:", refreshErr.message);
				config.github.accessToken = null;
				config.github.refreshToken = null;
				saveConfig(config);
				return { hasStarred: false, tokenExpired: true };
			}
		}

		if (err.message === "401") {
			console.warn("[GitHub Auth] Token expired or revoked.");
			return { hasStarred: false, tokenExpired: true };
		}
		console.error("[GitHub Auth] Check error:", err.message);
		return { hasStarred: false };
	}
}

export async function connectGitHubDeviceFlow(onUserCode, onProgress) {
	let codes;
	try {
		codes = await requestDeviceCodes();
	} catch (err) {
		console.error("[GitHub Auth] ❌ Device code request failed:", err.message);
		return { hasStarred: false, error: err.message };
	}

	const { device_code, user_code, verification_uri, expires_in, interval } =
		codes;

	onUserCode?.({
		userCode: user_code,
		verificationUri: verification_uri,
		expiresIn: expires_in,
	});
	shell.openExternal(verification_uri);

	console.log(`[GitHub Auth] Code: ${user_code} → ${verification_uri}`);

	let tokenData;
	try {
		tokenData = await pollForToken(
			device_code,
			interval,
			expires_in,
			onProgress,
		);
	} catch (err) {
		const msg =
			err.message === "expired"
				? "Code expired, try again."
				: err.message === "access_denied"
					? "Access denied."
					: err.message;
		console.error("[GitHub Auth] ❌", msg);
		return { hasStarred: false, error: msg };
	}

	let hasStarred = false;
	try {
		hasStarred = await checkRepoStarred(tokenData.accessToken);
	} catch (err) {
		console.error("[GitHub Auth] ❌ Star check error:", err.message);
	}

	const config = loadConfig();
	config.github ??= {};
	config.github.accessToken = tokenData.accessToken;
	config.github.refreshToken = tokenData.refreshToken;
	config.github.expiresAt = tokenData.expiresAt;
	saveConfig(config);

	console.log(`[GitHub Auth] Done. Star: ${hasStarred ? "✔" : "❌"}`);
	return { hasStarred };
}

export function disconnectGitHub() {
	const config = loadConfig();
	config.github.accessToken = null;
	config.github.refreshToken = null;
	config.github.expiresAt = null;
	saveConfig(config);
	console.log("[GitHub Auth] Token cleared.");
}
