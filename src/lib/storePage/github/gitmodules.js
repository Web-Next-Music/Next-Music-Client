import { CONTENTS_TTL, cachedGet } from "./httpClient.js";

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
