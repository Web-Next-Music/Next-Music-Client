import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BrowserWindow, shell } from "electron";

import {
	GITHUB_OWNER,
	GITHUB_REPO,
	httpsGet,
	normalizeGitUrl,
	loadGitmodules,
	getCatalog,
	getRemoteHeadCommit,
	getLatestNmRelease,
	fetchReadme,
	renderMarkdown,
	getRateLimitState,
	pLimit,
	cachedGet,
	CONTENTS_TTL,
} from "./github/index.js";

const CLIENT_REPO_OWNER = "Web-Next-Music";
const CLIENT_REPO_NAME = "Next-Music-Client";

import { getLogo, setLogo } from "./cache.js";

import {
	downloadTree,
	downloadAndExtractTarGz,
	downloadSourceZip,
} from "./download.js";

import { readOldHandleEvents, applyHandleEventsMerge } from "./handleEvents.js";

import {
	addonsDirectory,
	getLocalReleaseTag,
	getLocalCommitHash,
	installedEntries,
	fsToggle,
	fsDelete,
	getCustomEntries,
	findRawEntry,
	invalidateAddonsDir,
} from "./filesystem.js";

import { getPaths } from "../../config.js";
import { getCurrentLangCode } from "../langManager.js";
import { getConfig } from "../configManager.js";
const json = (d, status = 200) => ({
	status,
	headers: { "Content-Type": "application/json" },
	body: Buffer.from(JSON.stringify(d)),
});

const text = (t, ct = "text/plain; charset=utf-8") => ({
	status: 200,
	headers: { "Content-Type": ct },
	body: Buffer.from(t, "utf8"),
});

const binary = (buf, ct, cacheControl) => ({
	status: 200,
	headers: {
		"Content-Type": ct,
		...(cacheControl ? { "Cache-Control": cacheControl } : {}),
	},
	body: buf,
});

const notFound = () => ({
	status: 404,
	headers: {},
	body: Buffer.alloc(0),
});

function findMainWindow() {
	const wins = BrowserWindow.getAllWindows();

	return (
		wins.find((w) => w.webContents.getURL().includes("music.yandex")) ||
		wins.find((w) => {
			const u = w.webContents.getURL();
			return !u.startsWith("file://");
		}) ||
		null
	);
}

const LOGO_TTL = 7 * 24 * 60 * 60 * 1000;
const LOGO_CACHE_CONTROL = "public, max-age=604800";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function markdownCssPath() {
	return path.join(__dirname, "assets", "github-markdown.css");
}

const staticCache = new Map();

function readStatic(filePath) {
	const hit = staticCache.get(filePath);
	if (hit !== undefined) return hit;

	const buf = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
	staticCache.set(filePath, buf);

	return buf;
}

const IMG_MIME = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
};

async function checkUpdate(name, subUrl, token, force) {
	try {
		if (!name || !subUrl) return { name, hasUpdate: false };
		const normalized = normalizeGitUrl(subUrl);

		const m =
			normalized &&
			normalized.match(
				/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
			);

		if (!m) return { name, hasUpdate: false };
		const [, owner, repo] = m;

		const localTag = getLocalReleaseTag(name);

		if (localTag) {
			const nmRelease = await getLatestNmRelease(
				owner,
				repo,
				token,
				force,
			);
			if (!nmRelease) return { name, hasUpdate: false };

			return {
				name,
				hasUpdate: nmRelease.tag !== localTag,
				remoteHash: nmRelease.tag,
				localHash: localTag,
			};
		}

		const remoteHash = await getRemoteHeadCommit(owner, repo, token, force);
		const localHash = getLocalCommitHash(name);

		return {
			name,
			hasUpdate: !!remoteHash && !!localHash && remoteHash !== localHash,
			remoteHash,
			localHash,
		};
	} catch (e) {
		return { name, hasUpdate: false, error: e.message };
	}
}

export async function handleRequest(method, urlPath, qp, getBody) {
	if (method === "GET" && urlPath === "/api/installed")
		return json(installedEntries());

	if (method === "GET" && urlPath === "/api/custom") {
		try {
			const known = qp.known ? JSON.parse(qp.known) : [];
			return json(getCustomEntries(known));
		} catch (e) {
			return json({ error: e.message }, 500);
		}
	}

	if (method === "GET" && urlPath === "/api/rate-limit")
		return json(getRateLimitState());

	if (method === "GET" && urlPath === "/api/client-tags") {
		const token = getConfig().github?.accessToken || undefined;

		try {
			const { status, data } = await cachedGet(
				`https://api.github.com/repos/${CLIENT_REPO_OWNER}/${CLIENT_REPO_NAME}/tags?per_page=100`,
				{ token, ttl: CONTENTS_TTL },
			);
			if (status !== 200 || !Array.isArray(data))
				return json({ tags: [] });

			return json({ tags: data.map((t) => t.name).filter(Boolean) });
		} catch {
			return json({ tags: [] });
		}
	}

	if (method === "GET" && urlPath.startsWith("/api/section/")) {
		const section = urlPath.slice("/api/section/".length);
		const token = getConfig().github?.accessToken || undefined;
		const force = qp.force === "1";

		try {
			const items = await getCatalog(
				GITHUB_OWNER,
				GITHUB_REPO,
				section,
				token,
				force,
			);

			return json(items);
		} catch (e) {
			return json({ error: e.message }, 500);
		}
	}

	if (method === "GET" && urlPath === "/api/logo") {
		if (!qp.url) return notFound();

		const cached = getLogo(qp.url, LOGO_TTL);
		if (cached)
			return binary(cached.body, cached.contentType, LOGO_CACHE_CONTROL);

		try {
			const r = await httpsGet(qp.url);
			if (r.statusCode !== 200) return notFound();

			const contentType = r.headers["content-type"] || "image/png";
			setLogo(qp.url, r.body, contentType);

			return binary(r.body, contentType, LOGO_CACHE_CONTROL);
		} catch {
			return notFound();
		}
	}

	if (method === "GET" && urlPath === "/api/local-logo") {
		try {
			const { name, file } = qp;
			if (!name || !file) return notFound();

			const raw = findRawEntry(name) || name;
			const filePath = path.join(addonsDirectory, raw, file);

			if (!fs.existsSync(filePath)) return notFound();

			return binary(
				fs.readFileSync(filePath),
				IMG_MIME[path.extname(file).toLowerCase()] || "image/png",
				LOGO_CACHE_CONTROL,
			);
		} catch {
			return notFound();
		}
	}

	if (method === "GET" && urlPath === "/api/local-readme") {
		try {
			const { name, file } = qp;
			if (!name || !file) return notFound();

			const raw = findRawEntry(name) || name;
			const filePath = path.join(addonsDirectory, raw, file);

			if (!fs.existsSync(filePath)) return notFound();

			return text(fs.readFileSync(filePath, "utf8"));
		} catch {
			return notFound();
		}
	}

	if (method === "GET" && urlPath === "/api/readme") {
		if (!qp.url) return notFound();

		try {
			const md = await fetchReadme(qp.url);
			return text(md);
		} catch {
			return notFound();
		}
	}

	if (method === "GET" && urlPath === "/api/markdown-css") {
		try {
			return text(fs.readFileSync(markdownCssPath(), "utf8"), "text/css");
		} catch {
			return notFound();
		}
	}

	if (method === "POST" && urlPath === "/api/render-markdown") {
		try {
			const { text: md, url } = JSON.parse(await getBody());
			const token = getConfig().github?.accessToken || undefined;

			return json({ html: await renderMarkdown(md, url, token) });
		} catch {
			return json({ html: "" });
		}
	}

	if (method === "POST" && urlPath === "/api/download") {
		try {
			const {
				name,
				folderPath,
				submodule,
				subUrl,
				releaseCache = {},
			} = JSON.parse(await getBody());

			if (!name) throw new Error("Missing name");
			const dest = path.join(addonsDirectory, name);
			const token = getConfig().github?.accessToken || undefined;

			const oldHandleEvents = readOldHandleEvents(dest);

			if (submodule && subUrl) {
				const normalized = normalizeGitUrl(subUrl);
				const m =
					normalized &&
					normalized.match(
						/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
					);

				if (!m)
					throw new Error("Cannot parse submodule URL: " + subUrl);
				const [, subOwner, subRepo] = m;

				const cacheKey = `${subOwner}/${subRepo}`;
				const releaseCacheKey = cacheKey.toLowerCase();
				let nmRelease = null;
				let apiAvailable = true;
				const hasCachedRelease = !!releaseCache[releaseCacheKey];

				try {
					nmRelease = await getLatestNmRelease(
						subOwner,
						subRepo,
						token,
						true,
					);
				} catch {
					apiAvailable = false;
				}

				if (!apiAvailable) {
					if (hasCachedRelease) {
						throw new Error(
							`GitHub releases API is unavailable. Skipping "${name}" because it previously had a release build. Try again later.`,
						);
					}
				}

				if (nmRelease) {
					fs.mkdirSync(dest, { recursive: true });
					await downloadAndExtractTarGz(nmRelease.downloadUrl, dest);
					fs.writeFileSync(
						path.join(dest, ".git-release"),
						nmRelease.tag,
						"utf8",
					);
				} else {
					// API works but no nm.tar.gz release (never had one, or author removed it)
					fs.mkdirSync(dest, { recursive: true });
					await downloadSourceZip(subOwner, subRepo, dest, token);
					try {
						const sha = await getRemoteHeadCommit(
							subOwner,
							subRepo,
							token,
							true,
						);
						if (sha)
							fs.writeFileSync(
								path.join(dest, ".git-commit"),
								sha,
								"utf8",
							);
					} catch {}
				}

				applyHandleEventsMerge(dest, oldHandleEvents);
				invalidateAddonsDir();

				return json({
					ok: true,
					releaseInfo: {
						key: releaseCacheKey,
						hasRelease: !!nmRelease,
					},
				});
			} else {
				const gm = await loadGitmodules(GITHUB_OWNER, GITHUB_REPO);
				await downloadTree(
					folderPath,
					dest,
					GITHUB_OWNER,
					GITHUB_REPO,
					gm,
					token,
				);
			}

			applyHandleEventsMerge(dest, oldHandleEvents);
			invalidateAddonsDir();

			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "GET" && urlPath === "/api/check-update") {
		const token = getConfig().github?.accessToken || undefined;

		return json(
			await checkUpdate(
				qp.name,
				qp.subUrl ? decodeURIComponent(qp.subUrl) : null,
				token,
				qp.force === "1",
			),
		);
	}

	if (method === "POST" && urlPath === "/api/check-updates") {
		try {
			const { items = [], force = false } = JSON.parse(await getBody());
			const token = getConfig().github?.accessToken || undefined;

			const results = await pLimit(
				items.map(
					(it) => () =>
						checkUpdate(it.name, it.subUrl, token, !!force),
				),
				6,
			);

			return json(results);
		} catch (e) {
			return json({ error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/toggle") {
		try {
			const { name } = JSON.parse(await getBody());
			const enabled = fsToggle(name);
			return json({ ok: true, enabled });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/delete") {
		try {
			const { name } = JSON.parse(await getBody());
			fsDelete(name);
			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "GET" && urlPath === "/api/lang") {
		try {
			const { languagesDirectory } = getPaths();
			const config = getConfig();
			const langCode =
				config?.programSettings?.language ||
				getCurrentLangCode() ||
				"en";

			const langFile = path.join(languagesDirectory, `${langCode}.json`);
			const enFile = path.join(languagesDirectory, "en.json");

			const buf = readStatic(langFile) || readStatic(enFile);
			if (!buf) return json({ error: "Language file not found" }, 404);

			return text(
				buf.toString("utf8"),
				"application/json; charset=utf-8",
			);
		} catch (e) {
			return json({ error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/open-url") {
		try {
			const { url } = JSON.parse(await getBody());
			if (!url || !url.startsWith("https://"))
				throw new Error("Invalid URL");
			await shell.openExternal(url);
			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/reload") {
		try {
			const mainWin =
				findMainWindow() || BrowserWindow.getAllWindows()[0];

			if (mainWin) mainWin.webContents.reload();

			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "GET" && urlPath === "/api/check-handle-events") {
		try {
			const { name } = qp;
			if (!name) return json({ exists: false });

			const raw = findRawEntry(name);

			if (!raw) return json({ exists: false });
			const filePath = path.join(
				addonsDirectory,
				raw,
				"handleEvents.json",
			);

			return json({ exists: fs.existsSync(filePath), path: filePath });
		} catch (e) {
			return json({ exists: false, error: e.message });
		}
	}

	if (method === "GET" && urlPath === "/api/read-handle-events") {
		try {
			const { name } = qp;
			if (!name) throw new Error("Missing name");

			const raw = findRawEntry(name);

			if (!raw) throw new Error("Addon not found: " + name);
			const filePath = path.join(
				addonsDirectory,
				raw,
				"handleEvents.json",
			);

			if (!fs.existsSync(filePath))
				throw new Error("handleEvents.json not found");

			const content = fs.readFileSync(filePath, "utf8");

			return json({ ok: true, content });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/save-handle-events") {
		try {
			const { name, content } = JSON.parse(await getBody());
			if (!name) throw new Error("Missing name");
			JSON.parse(content);

			const raw = findRawEntry(name);

			if (!raw) throw new Error("Addon not found: " + name);
			const filePath = path.join(
				addonsDirectory,
				raw,
				"handleEvents.json",
			);

			if (!fs.existsSync(filePath))
				throw new Error("handleEvents.json not found");

			fs.writeFileSync(filePath, content, "utf8");

			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	if (method === "POST" && urlPath === "/api/open-handle-events") {
		try {
			const { name } = JSON.parse(await getBody());
			if (!name) throw new Error("Missing name");

			const raw = findRawEntry(name);

			if (!raw) throw new Error("Addon not found: " + name);
			const filePath = path.join(
				addonsDirectory,
				raw,
				"handleEvents.json",
			);

			if (!fs.existsSync(filePath))
				throw new Error("handleEvents.json not found");

			await shell.openPath(filePath);

			return json({ ok: true });
		} catch (e) {
			return json({ ok: false, error: e.message }, 500);
		}
	}

	return notFound();
}
