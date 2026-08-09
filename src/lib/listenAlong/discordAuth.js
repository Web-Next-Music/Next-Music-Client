import http from "node:http";
import crypto from "node:crypto";
import { shell } from "electron";

const DISCORD_CLIENT_ID = "1300258490815741952";
const REDIRECT_PORT = 51820;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const CALLBACK_TIMEOUT_MS = 120000;

function base64url(buf) {
	return buf
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function makePkcePair() {
	const verifier = base64url(crypto.randomBytes(48));
	const challenge = base64url(
		crypto.createHash("sha256").update(verifier).digest(),
	);
	return { verifier, challenge };
}

function buildAuthorizeUrl(codeChallenge) {
	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		response_type: "code",
		scope: "identify",
		redirect_uri: REDIRECT_URI,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});
	return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function getAuthCode(codeChallenge) {
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			let url;
			try {
				url = new URL(req.url, REDIRECT_URI);
			} catch {
				res.writeHead(400).end("Bad request");
				return;
			}

			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}

			const code = url.searchParams.get("code");
			const error = url.searchParams.get("error");

			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(
				code
					? "<html><body>Signed in - you can close this tab and return to Next Music.</body></html>"
					: "<html><body>Discord sign-in failed. You can close this tab.</body></html>",
			);

			server.close();
			clearTimeout(timeout);

			if (code) resolve(code);
			else reject(new Error(error || "Discord sign-in was cancelled"));
		});

		const timeout = setTimeout(() => {
			server.close();
			reject(new Error("Discord sign-in timed out"));
		}, CALLBACK_TIMEOUT_MS);

		server.on("error", (err) => {
			clearTimeout(timeout);
			if (err.code === "EADDRINUSE") {
				reject(
					new Error(
						`Port ${REDIRECT_PORT} is already in use - close whatever is using it and try again`,
					),
				);
			} else {
				reject(err);
			}
		});

		server.listen(REDIRECT_PORT, "127.0.0.1", () => {
			shell.openExternal(buildAuthorizeUrl(codeChallenge));
		});
	});
}

function tokensFromResponse(data, fallbackRefreshToken) {
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token || fallbackRefreshToken || null,
		expiresAt: Date.now() + (data.expires_in || 604800) * 1000,
	};
}

async function exchangeCodeForToken(code, codeVerifier) {
	const body = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		grant_type: "authorization_code",
		code,
		redirect_uri: REDIRECT_URI,
		code_verifier: codeVerifier,
	});

	const res = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Discord token exchange failed: ${res.status} ${text}`);
	}

	const data = await res.json();
	if (!data.access_token) {
		throw new Error("Discord token exchange returned no access token");
	}

	return tokensFromResponse(data);
}

export async function getDiscordTokens() {
	const { verifier, challenge } = makePkcePair();
	const code = await getAuthCode(challenge);
	return exchangeCodeForToken(code, verifier);
}

export async function refreshDiscordTokens(refreshToken) {
	const body = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});

	const res = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Discord token refresh failed: ${res.status} ${text}`);
	}

	const data = await res.json();
	if (!data.access_token) {
		throw new Error("Discord token refresh returned no access token");
	}

	return tokensFromResponse(data, refreshToken);
}
