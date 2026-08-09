import { getEntry, isFresh, setEntry } from "../cache.js";
import { CONTENTS_TTL, META_TTL, UPDATE_TTL, cachedGet } from "./httpClient.js";
import { loadGitmodules, normalizeGitUrl } from "./gitmodules.js";
import {
	findBrandingDir,
	findLogoRecursive,
	metaFromTree,
	pickImg,
} from "./branding.js";

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
