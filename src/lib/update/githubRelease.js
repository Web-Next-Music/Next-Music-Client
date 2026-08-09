import https from "https";
import { getConfig } from "../configManager.js";

const GITHUB_LATEST =
	"https://api.github.com/repos/Web-Next-Music/Next-Music-Client/releases/latest";

export function getGitHubToken() {
	try {
		const token = getConfig()?.github?.accessToken;
		return typeof token === "string" && token.trim() ? token.trim() : null;
	} catch {
		return null;
	}
}

export async function fetchLatestRelease() {
	const token = getGitHubToken();
	if (token) {
		try {
			return await getJson(GITHUB_LATEST, token);
		} catch (err) {
			console.warn(
				`[Updater] Authenticated GitHub request failed (${err.message}); retrying anonymously.`,
			);
		}
	}
	return getJson(GITHUB_LATEST);
}

export function getJson(url, token) {
	return new Promise((resolve, reject) => {
		const headers = {
			"User-Agent": "Next-Music-Updater",
			Accept: "application/vnd.github+json",
		};
		if (token) headers.Authorization = `Bearer ${token}`;

		https
			.get(url, { headers }, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					const status = res.statusCode || 0;
					if (status < 200 || status >= 300) {
						reject(new Error(`HTTP ${status}`));
						return;
					}
					try {
						resolve(JSON.parse(data));
					} catch (err) {
						reject(err);
					}
				});
			})
			.on("error", reject);
	});
}

export function isNewer(latestRaw, currentRaw) {
	const latest = parseVersion(normalizeVersion(latestRaw));
	const current = parseVersion(normalizeVersion(currentRaw));

	if (!latest || !current) return false;

	for (let i = 0; i < 3; i++) {
		if (latest.base[i] > current.base[i]) return true;
		if (latest.base[i] < current.base[i]) return false;
	}

	if (latest.beta === null && current.beta === null) return false;
	if (latest.beta === null) return true;
	if (current.beta === null) return false;
	return latest.beta > current.beta;
}

export function normalizeVersion(v) {
	return String(v ?? "")
		.trim()
		.replace(/^v/, "");
}

export function parseVersion(v) {
	const beta = v.match(/^(\d+)\.(\d+)\.(\d+)-beta[.-]?(\d+)?$/);
	if (beta) {
		return {
			base: [Number(beta[1]), Number(beta[2]), Number(beta[3])],
			beta: Number(beta[4] ?? 0),
		};
	}
	const stable = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (stable) {
		return {
			base: [Number(stable[1]), Number(stable[2]), Number(stable[3])],
			beta: null,
		};
	}
	return null;
}
