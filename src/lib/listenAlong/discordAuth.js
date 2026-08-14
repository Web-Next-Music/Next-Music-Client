import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell } from "electron";

const DISCORD_CLIENT_ID = "1300258490815741952";

const REDIRECT_PORT = 51820;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;
const CALLBACK_TIMEOUT_MS = 120000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CALLBACK_DIR = path.join(__dirname, "callback");
const CALLBACK_HTML = path.join(CALLBACK_DIR, "callback.html");
const CALLBACK_CSS = path.join(CALLBACK_DIR, "callback.css");
const CALLBACK_BG = path.join(
	__dirname,
	"..",
	"..",
	"assets",
	"listen-along",
	"callback",
	"bg.webp",
);

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

	return {
		verifier,
		challenge,
	};
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

function tokensFromResponse(data, fallbackRefreshToken) {
	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token || fallbackRefreshToken || null,
		expiresAt: Date.now() + (data.expires_in || 604800) * 1000,
	};
}

function defaultDiscordAvatarUrl(user) {
	const index =
		user.discriminator && user.discriminator !== "0"
			? Number(user.discriminator) % 5
			: Number((BigInt(user.id) >> 22n) % 6n);

	return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export async function fetchDiscordProfile(accessToken) {
	const res = await fetch("https://discord.com/api/users/@me", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!res.ok) {
		return {
			username: null,
			displayName: null,
			avatarUrl: null,
		};
	}

	const user = await res.json();

	const username = user.username || null;
	const displayName = user.global_name || username;

	const avatarUrl = user.avatar
		? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
		: defaultDiscordAvatarUrl(user);

	return {
		username,
		displayName,
		avatarUrl,
	};
}

function escapeHtml(str) {
	return String(str).replace(
		/[&<>"']/g,
		(c) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&#39;",
			})[c],
	);
}

function renderCallbackPage({ ok, displayName, avatarUrl, message }) {
	const template = fs.readFileSync(CALLBACK_HTML, "utf8");

	const heading = ok ? "Congratulations!" : "Sign-in failed";

	const body = ok
		? `<p class="sub">You can close this tab and return to Next Music</p>`
		: `<p class="sub">${escapeHtml(
				message || "Discord sign-in was cancelled.",
			)}</p>`;

	const identity =
		ok && displayName
			? `
				<div class="identity">
					<img
						class="avatar"
						src="${escapeHtml(avatarUrl)}"
						alt=""
					/>
					<span class="username">
						${escapeHtml(displayName)}
					</span>
				</div>
			`
			: "";

	return template
		.replace("__HEADING__", heading)
		.replace("__BODY__", body)
		.replace("__IDENTITY__", identity);
}

function getAuthResult(codeChallenge, codeVerifier) {
	return new Promise((resolve, reject) => {
		let settled = false;

		const server = http.createServer(async (req, res) => {
			let url;

			try {
				url = new URL(req.url, REDIRECT_URI);
			} catch {
				res.writeHead(400).end("Bad request");
				return;
			}

			/*
			 * CSS
			 */
			if (url.pathname === "/callback.css") {
				try {
					const css = fs.readFileSync(CALLBACK_CSS);

					res.writeHead(200, {
						"Content-Type": "text/css; charset=utf-8",
						"Cache-Control": "no-store",
					});

					res.end(css);
				} catch (err) {
					console.error("Failed to load callback CSS:", err);

					res.writeHead(500).end("Failed to load CSS");
				}

				return;
			}

			/*
			 * Background image
			 */
			if (url.pathname === "/bg.webp") {
				try {
					const image = fs.readFileSync(CALLBACK_BG);

					res.writeHead(200, {
						"Content-Type": "image/webp",
						"Cache-Control": "no-store",
					});

					res.end(image);
				} catch (err) {
					console.error("Failed to load callback background:", err);

					res.writeHead(500).end("Failed to load background");
				}

				return;
			}

			/*
			 * OAuth callback
			 */
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}

			const code = url.searchParams.get("code");

			const error = url.searchParams.get("error");

			server.close();
			clearTimeout(timeout);

			if (!code) {
				res.writeHead(200, {
					"Content-Type": "text/html; charset=utf-8",
				});

				res.end(
					renderCallbackPage({
						ok: false,
						message: error || "Discord sign-in was cancelled.",
					}),
				);

				if (!settled) {
					settled = true;

					reject(new Error(error || "Discord sign-in was cancelled"));
				}

				return;
			}

			try {
				const tokens = await exchangeCodeForToken(code, codeVerifier);

				const { username, displayName, avatarUrl } =
					await fetchDiscordProfile(tokens.accessToken);

				res.writeHead(200, {
					"Content-Type": "text/html; charset=utf-8",
				});

				res.end(
					renderCallbackPage({
						ok: true,
						displayName,
						avatarUrl,
					}),
				);

				if (!settled) {
					settled = true;

					resolve({
						tokens,
						username,
						displayName,
						avatarUrl,
					});
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err);

				res.writeHead(200, {
					"Content-Type": "text/html; charset=utf-8",
				});

				res.end(
					renderCallbackPage({
						ok: false,
						message,
					}),
				);

				if (!settled) {
					settled = true;
					reject(err);
				}
			}
		});

		const timeout = setTimeout(() => {
			server.close();

			if (!settled) {
				settled = true;

				reject(new Error("Discord sign-in timed out"));
			}
		}, CALLBACK_TIMEOUT_MS);

		server.on("error", (err) => {
			clearTimeout(timeout);

			if (!settled) {
				settled = true;

				if (err.code === "EADDRINUSE") {
					reject(
						new Error(
							`Port ${REDIRECT_PORT} is already in use - close whatever is using it and try again`,
						),
					);
				} else {
					reject(err);
				}
			}
		});

		server.listen(REDIRECT_PORT, "127.0.0.1", () => {
			shell.openExternal(buildAuthorizeUrl(codeChallenge));
		});
	});
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
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
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

	return getAuthResult(challenge, verifier);
}

export async function refreshDiscordTokens(refreshToken) {
	const body = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});

	const res = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
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
