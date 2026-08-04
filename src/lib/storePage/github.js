import https from "https";
import crypto from "crypto";
import { getEntry, isFresh, setEntry, touchEntry } from "./cache.js";

export const GITHUB_OWNER = "Web-Next-Music";
export const GITHUB_REPO = "Next-Music-Extensions";

const HOUR = 60 * 60 * 1000;
export const CONTENTS_TTL = 6 * HOUR;
export const UPDATE_TTL = 1 * HOUR;
export const META_TTL = 6 * HOUR;

export function httpsGet(url, headers = {}, timeout = 15000) {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					"User-Agent": "Next-Music-Store/1.0",
					Accept: "application/vnd.github.v3+json",
					...headers,
				},
			},
			(res) => {
				if (res.statusCode === 301 || res.statusCode === 302)
					return httpsGet(res.headers.location, headers, timeout)
						.then(resolve)
						.catch(reject);
				const c = [];
				res.on("data", (d) => c.push(d));
				res.on("end", () =>
					resolve({
						statusCode: res.statusCode,
						body: Buffer.concat(c),
						headers: res.headers,
					}),
				);
			},
		);
		req.on("error", reject);
		req.setTimeout(timeout, () => {
			req.destroy();
			reject(new Error("Request timeout: " + url));
		});
	});
}

export function httpsPost(url, body, headers = {}, timeout = 15000) {
	return new Promise((resolve, reject) => {
		const payload = Buffer.from(body, "utf8");
		const req = https.request(
			url,
			{
				method: "POST",
				headers: {
					"User-Agent": "Next-Music-Store/1.0",
					Accept: "application/vnd.github.v3+json",
					"Content-Type": "application/json",
					"Content-Length": payload.length,
					...headers,
				},
			},
			(res) => {
				const c = [];
				res.on("data", (d) => c.push(d));
				res.on("end", () =>
					resolve({
						statusCode: res.statusCode,
						body: Buffer.concat(c),
						headers: res.headers,
					}),
				);
			},
		);
		req.on("error", reject);
		req.setTimeout(timeout, () => {
			req.destroy();
			reject(new Error("Request timeout: " + url));
		});
		req.end(payload);
	});
}

function authHeader(token) {
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export class RateLimitError extends Error {
	constructor(resetAt) {
		super("GitHub API rate limit exceeded");
		this.name = "RateLimitError";
		this.rateLimited = true;
		this.resetAt = resetAt || 0;
	}
}

const rateLimit = { remaining: null, resetAt: 0 };

export function getRateLimitState() {
	const limited = rateLimit.remaining === 0 && Date.now() < rateLimit.resetAt;
	return { limited, resetAt: limited ? rateLimit.resetAt : 0 };
}

function noteRateLimit(headers) {
	const remaining = headers["x-ratelimit-remaining"];
	const reset = headers["x-ratelimit-reset"];

	if (remaining !== undefined) rateLimit.remaining = Number(remaining);
	if (reset !== undefined) rateLimit.resetAt = Number(reset) * 1000;
}

function isRateLimitResponse(r) {
	if (r.statusCode !== 403 && r.statusCode !== 429) return false;
	if (r.headers["x-ratelimit-remaining"] === "0") return true;
	return /rate limit/i.test(r.body.toString());
}

const inflight = new Map();

function cachedGet(url, opts = {}) {
	const key = url + (opts.force ? "!" : "");
	const pending = inflight.get(key);
	if (pending) return pending;

	const request = fetchWithCache(url, opts).finally(() =>
		inflight.delete(key),
	);

	inflight.set(key, request);
	return request;
}

async function fetchWithCache(
	url,
	{ token, ttl, force = false, api = true } = {},
) {
	const key = "req:" + url;
	const entry = getEntry(key);

	if (!force && isFresh(entry, ttl)) return entry.v;

	if (api) {
		const state = getRateLimitState();
		if (state.limited) {
			if (entry) return entry.v;
			throw new RateLimitError(state.resetAt);
		}
	}

	const headers = api ? authHeader(token) : {};
	if (entry?.etag) headers["If-None-Match"] = entry.etag;

	const r = await httpsGet(url, headers);
	if (api) noteRateLimit(r.headers);

	if (r.statusCode === 304 && entry) {
		touchEntry(key);
		return entry.v;
	}

	if (api && isRateLimitResponse(r)) {
		rateLimit.remaining = 0;
		if (entry) return entry.v;
		throw new RateLimitError(rateLimit.resetAt);
	}

	const raw = r.body.toString();
	let data = null;

	if (raw) {
		try {
			data = JSON.parse(raw);
		} catch {
			data = raw;
		}
	}

	const result = { status: r.statusCode, data };

	if (r.statusCode === 200 || r.statusCode === 404)
		setEntry(key, result, r.headers.etag);

	return result;
}

export async function ghContents(owner, repo, p, token, force = false) {
	const url = p
		? `https://api.github.com/repos/${owner}/${repo}/contents/${p}`
		: `https://api.github.com/repos/${owner}/${repo}/contents`;

	const { status, data } = await cachedGet(url, {
		token,
		ttl: CONTENTS_TTL,
		force,
	});

	if (status !== 200)
		throw new Error(`GitHub ${status}: ${data?.message || url}`);

	return data;
}

export async function resolveSubmoduleUrl(owner, repo, itemPath, token) {
	try {
		const { data } = await cachedGet(
			`https://api.github.com/repos/${owner}/${repo}/contents/${itemPath}`,
			{ token, ttl: CONTENTS_TTL },
		);
		return data?.submodule_git_url || null;
	} catch {
		return null;
	}
}

export async function getRemoteHeadCommit(owner, repo, token, force = false) {
	try {
		const { status, data } = await cachedGet(
			`https://api.github.com/repos/${owner}/${repo}/commits/HEAD`,
			{ token, ttl: UPDATE_TTL, force },
		);

		if (status !== 200) return null;
		return data?.sha || null;
	} catch {
		return null;
	}
}

export async function getLatestNmRelease(owner, repo, token, force = false) {
	// Throws on network/API errors → caller treats as "API unavailable"
	// Returns null → API works, but no nm.tar.gz release exists
	const { status, data } = await cachedGet(
		`https://api.github.com/repos/${owner}/${repo}/releases/latest`,
		{ token, ttl: UPDATE_TTL, force },
	);

	if (status === 404) return null;
	if (status !== 200) throw new Error(`GitHub releases API: HTTP ${status}`);

	const asset =
		data.assets && data.assets.find((a) => a.name.endsWith("nm.tar.gz"));

	if (!asset) return null;

	return { tag: data.tag_name, downloadUrl: asset.browser_download_url };
}

export function normalizeGitUrl(url) {
	if (!url) return null;
	return url
		.replace(/^git:\/\/github\.com\//, "https://github.com/")
		.replace(/^git@github\.com:/, "https://github.com/");
}

export function parseGitmodules(text) {
	const map = {};
	const blocks = text.split(/(?=\[submodule\s+"[^"]*"\])/);

	for (const block of blocks) {
		const pm = block.match(/path\s*=\s*(.+)/);
		const um = block.match(/url\s*=\s*(.+)/);
		if (pm && um) map[pm[1].trim()] = um[1].trim();
	}

	return map;
}

const gitmodulesBranch = new Map();

export async function loadGitmodules(owner, repo, force = false) {
	const repoKey = `${owner}/${repo}`;
	const known = gitmodulesBranch.get(repoKey);
	const branches = known
		? [known, ...["main", "master", "HEAD"].filter((b) => b !== known)]
		: ["main", "master", "HEAD"];

	for (const branch of branches) {
		try {
			const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.gitmodules`;
			const { status, data } = await cachedGet(url, {
				ttl: CONTENTS_TTL,
				force,
				api: false,
			});

			if (status === 200 && typeof data === "string" && data.length > 0) {
				gitmodulesBranch.set(repoKey, branch);
				return parseGitmodules(data);
			}
		} catch {}
	}
	return {};
}

function isImg(n) {
	return /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
}

function pickImg(list) {
	return (
		list.find(
			(i) =>
				i.type === "file" &&
				/^(image|icon|logo|preview)\./i.test(i.name) &&
				isImg(i.name),
		)?.download_url ||
		list.find((i) => i.type === "file" && isImg(i.name))?.download_url ||
		null
	);
}

function rawUrl(owner, repo, filePath) {
	const encoded = filePath.split("/").map(encodeURIComponent).join("/");
	return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${encoded}`;
}

// One recursive tree call returns the whole repo, replacing the per-directory
// contents walk. Returns null when unusable (truncated on huge repos, errors),
// so callers fall back to the contents API.
export async function repoTree(owner, repo, token, force = false) {
	try {
		const { status, data } = await cachedGet(
			`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
			{ token, ttl: CONTENTS_TTL, force },
		);

		if (status !== 200 || !Array.isArray(data?.tree) || data.truncated)
			return null;

		return data.tree.filter((n) => n.type === "blob").map((n) => n.path);
	} catch {
		return null;
	}
}

function pickImgPath(paths) {
	const named = paths.find(
		(p) =>
			/^(image|icon|logo|preview)\./i.test(p.split("/").pop()) &&
			isImg(p),
	);

	return named || paths.find((p) => isImg(p)) || null;
}

function metaFromTree(owner, repo, paths, root) {
	const prefix = root ? root + "/" : "";
	const scoped = paths.filter((p) => p.startsWith(prefix));
	const rel = (p) => p.slice(prefix.length);

	const branding = scoped.filter((p) =>
		rel(p)
			.split("/")
			.slice(0, -1)
			.some((seg) => /^branding$/i.test(seg)),
	);

	const logo = pickImgPath(branding) || pickImgPath(scoped);

	const readme = scoped.find(
		(p) => !rel(p).includes("/") && /^readme\.md$/i.test(rel(p)),
	);

	return {
		logo: logo ? rawUrl(owner, repo, logo) : null,
		readme: readme ? rawUrl(owner, repo, readme) : null,
	};
}

async function findLogoRecursive(owner, repo, dirPath, depth = 0, token) {
	if (depth > 1) return null;
	try {
		const items = await ghContents(owner, repo, dirPath, token);
		const logo = pickImg(items);
		if (logo) return logo;

		for (const sub of items.filter((i) => i.type === "dir")) {
			const found = await findLogoRecursive(
				owner,
				repo,
				sub.path,
				depth + 1,
				token,
			);
			if (found) return found;
		}
	} catch {}
	return null;
}

async function findBrandingDir(owner, repo, items, depth = 0, token) {
	const branding = items.find(
		(i) => i.type === "dir" && /^branding$/i.test(i.name),
	);

	if (branding) return branding.path;
	if (depth >= 1) return null;

	for (const sub of items.filter((i) => i.type === "dir")) {
		try {
			const subItems = await ghContents(owner, repo, sub.path, token);
			const found = await findBrandingDir(
				owner,
				repo,
				subItems,
				depth + 1,
				token,
			);
			if (found) return found;
		} catch {}
	}
	return null;
}

export async function pLimit(tasks, limit = 6) {
	const results = [];
	let i = 0;

	async function run() {
		while (i < tasks.length) {
			const idx = i++;
			results[idx] = await tasks[idx]();
		}
	}

	const workers = Array.from({ length: Math.min(limit, tasks.length) }, run);
	await Promise.all(workers);

	return results;
}

export async function getSection(
	owner,
	repo,
	section,
	token,
	force = false,
	rootPaths = null,
) {
	const gitmodules = await loadGitmodules(owner, repo, force);
	const prefix = section + "/";
	const result = [];
	const seenNames = new Set();

	for (const [modPath, modUrl] of Object.entries(gitmodules)) {
		if (!modPath.startsWith(prefix)) continue;
		const name = modPath.slice(prefix.length);
		if (!name || name.includes("/")) continue;
		seenNames.add(name.toLowerCase());

		result.push({
			name,
			path: modPath,
			submodule: true,
			subUrl: normalizeGitUrl(modUrl),
		});
	}

	const addDir = (name) => {
		if (!name || seenNames.has(name.toLowerCase())) return;
		seenNames.add(name.toLowerCase());
		result.push({
			name,
			path: prefix + name,
			submodule: false,
			subUrl: null,
		});
	};

	if (rootPaths) {
		for (const p of rootPaths) {
			if (!p.startsWith(prefix)) continue;
			const rest = p.slice(prefix.length);
			if (!rest.includes("/")) continue;
			addDir(rest.split("/")[0]);
		}

		return result;
	}

	try {
		const items = await ghContents(owner, repo, section, token, force);

		for (const item of items) {
			if (item.type !== "dir") continue;
			addDir(item.name);
		}
	} catch {}

	return result;
}

export async function getFolderMeta(
	owner,
	repo,
	f,
	token,
	force = false,
	rootPaths = null,
) {
	const cacheKey = "meta:" + (f.submodule ? f.subUrl || f.name : f.path);
	const cached = getEntry(cacheKey);

	if (!force && isFresh(cached, META_TTL)) return cached.v;

	if (!f.submodule && rootPaths) {
		const result = metaFromTree(owner, repo, rootPaths, f.path);
		setEntry(cacheKey, result);
		return result;
	}

	try {
		let o = owner,
			r = repo,
			p = f.path;
		if (f.submodule) {
			if (!f.subUrl) return cached?.v || { logo: null, readme: null };
			const m = normalizeGitUrl(f.subUrl).match(
				/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
			);
			if (!m) return cached?.v || { logo: null, readme: null };
			o = m[1];
			r = m[2];
			p = "";
		}

		const paths = await repoTree(o, r, token, force);

		if (paths) {
			const result = metaFromTree(o, r, paths, p);
			setEntry(cacheKey, result);
			return result;
		}

		const items = await ghContents(o, r, p, token, force);

		const brandingPath = await findBrandingDir(o, r, items, 0, token);
		let logo = brandingPath
			? await findLogoRecursive(o, r, brandingPath, 0, token)
			: null;

		if (!logo) logo = pickImg(items);

		if (!logo) {
			for (const sub of items.filter((i) => i.type === "dir")) {
				try {
					const subItems = await ghContents(o, r, sub.path, token);
					const hasScript = subItems.some(
						(i) => i.type === "file" && /\.(css|js)$/i.test(i.name),
					);
					if (hasScript) {
						const found = pickImg(subItems);
						if (found) {
							logo = found;
							break;
						}
					}
				} catch {}
			}
		}

		const rm = items.find(
			(i) => i.type === "file" && /^readme\.md$/i.test(i.name),
		);

		const result = {
			logo,
			readme: rm ? rm.download_url : null,
		};

		setEntry(cacheKey, result);
		return result;
	} catch {
		return cached?.v || { logo: null, readme: null };
	}
}

export async function getCatalog(owner, repo, section, token, force = false) {
	const rootPaths = await repoTree(owner, repo, token, force);

	const items = await getSection(
		owner,
		repo,
		section,
		token,
		force,
		rootPaths,
	);

	return pLimit(
		items.map((f) => async () => ({
			...f,
			...(await getFolderMeta(owner, repo, f, token, force, rootPaths)),
		})),
		6,
	);
}

function markdownContext(url) {
	const m = String(url || "").match(
		/^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^/]+)\/([^/]+)/i,
	);
	return m ? `${m[1]}/${m[2]}` : "";
}

function resolveRelativeUrls(html, base) {
	if (!base) return html;
	return html.replace(/\b(src|href)="([^"]*)"/gi, (full, attr, value) => {
		if (!value || /^(https?:|data:|mailto:|#|\/\/)/i.test(value))
			return full;
		try {
			return `${attr}="${new URL(value, base).href}"`;
		} catch {
			return full;
		}
	});
}

export async function renderMarkdown(md, url, token) {
	if (!md) return "";

	const context = markdownContext(url);
	const hash = crypto.createHash("sha1").update(md).digest("hex");
	const key = `md:${context}:${hash}`;
	const cached = getEntry(key);

	if (isFresh(cached, CONTENTS_TTL)) return cached.v;

	const base = url ? url.replace(/[^/]*$/, "") : "";

	try {
		const r = await httpsPost(
			"https://api.github.com/markdown",
			JSON.stringify({
				text: md,
				mode: context ? "gfm" : "markdown",
				context: context || undefined,
			}),
			authHeader(token),
		);

		if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode}`);

		const html = resolveRelativeUrls(r.body.toString(), base);
		setEntry(key, html);
		return html;
	} catch {
		return cached?.v || "";
	}
}

export async function fetchReadme(url) {
	const key = "readme:" + url;
	const cached = getEntry(key);

	if (isFresh(cached, CONTENTS_TTL)) return cached.v;

	try {
		const r = await httpsGet(
			url,
			cached?.etag ? { "If-None-Match": cached.etag } : {},
		);

		if (r.statusCode === 304 && cached) {
			touchEntry(key);
			return cached.v;
		}

		if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode}`);

		const md = r.body.toString();
		setEntry(key, md, r.headers.etag);
		return md;
	} catch {
		return cached?.v || "";
	}
}
