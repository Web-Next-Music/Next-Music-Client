import https from "https";

export const GITHUB_OWNER = "Web-Next-Music";
export const GITHUB_REPO = "Next-Music-Extensions";

// ── HTTP ──

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

// ── GitHub API ──

export async function ghContents(owner, repo, p) {
    const url = p
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${p}`
        : `https://api.github.com/repos/${owner}/${repo}/contents`;
    const r = await httpsGet(url);
    const data = JSON.parse(r.body.toString());
    if (r.statusCode !== 200)
        throw new Error(`GitHub ${r.statusCode}: ${data.message || url}`);
    return data;
}

export async function resolveSubmoduleUrl(owner, repo, itemPath) {
    try {
        const r = await httpsGet(
            `https://api.github.com/repos/${owner}/${repo}/contents/${itemPath}`,
        );
        return JSON.parse(r.body.toString()).submodule_git_url || null;
    } catch {
        return null;
    }
}

export async function getRemoteHeadCommit(owner, repo) {
    try {
        const r = await httpsGet(
            `https://api.github.com/repos/${owner}/${repo}/commits/HEAD`,
        );
        if (r.statusCode !== 200) return null;
        return JSON.parse(r.body.toString()).sha || null;
    } catch {
        return null;
    }
}

/**
 * Returns { tag, downloadUrl } if the latest GitHub release for owner/repo
 * contains an asset whose name ends with "nm.tar.gz", otherwise returns null.
 */
export async function getLatestNmRelease(owner, repo) {
    try {
        const r = await httpsGet(
            `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
        );
        if (r.statusCode !== 200) return null;
        const release = JSON.parse(r.body.toString());
        const asset =
            release.assets &&
            release.assets.find((a) => a.name.endsWith("nm.tar.gz"));
        if (!asset) return null;
        return {
            tag: release.tag_name,
            downloadUrl: asset.browser_download_url,
        };
    } catch {
        return null;
    }
}

// ── Gitmodules ──

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

export async function loadGitmodules(owner, repo) {
    for (const branch of ["main", "master", "HEAD"]) {
        try {
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.gitmodules`;
            const r = await httpsGet(url);
            if (r.statusCode === 200 && r.body.length > 0) {
                return parseGitmodules(r.body.toString());
            }
        } catch {
            // try next branch
        }
    }
    return {};
}

// ── Image helpers ──

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

async function findLogoRecursive(owner, repo, dirPath, depth = 0) {
    if (depth > 5) return null;
    try {
        const items = await ghContents(owner, repo, dirPath);
        const logo = pickImg(items);
        if (logo) return logo;
        for (const sub of items.filter((i) => i.type === "dir")) {
            const found = await findLogoRecursive(
                owner,
                repo,
                sub.path,
                depth + 1,
            );
            if (found) return found;
        }
    } catch {
        /* skip */
    }
    return null;
}

async function findBrandingDir(owner, repo, items, depth = 0) {
    const branding = items.find(
        (i) => i.type === "dir" && /^branding$/i.test(i.name),
    );
    if (branding) return branding.path;
    if (depth >= 3) return null;
    for (const sub of items.filter((i) => i.type === "dir")) {
        try {
            const subItems = await ghContents(owner, repo, sub.path);
            const found = await findBrandingDir(
                owner,
                repo,
                subItems,
                depth + 1,
            );
            if (found) return found;
        } catch {
            /* skip */
        }
    }
    return null;
}

// ── Section listing ──

const metaCache = new Map();

export async function pLimit(tasks, limit = 3) {
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

export async function getSection(owner, repo, section) {
    const gitmodules = await loadGitmodules(owner, repo);
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

    try {
        const items = await ghContents(owner, repo, section);
        for (const item of items) {
            if (item.type !== "dir") continue;
            if (seenNames.has(item.name.toLowerCase())) continue;
            result.push({
                name: item.name,
                path: item.path,
                submodule: false,
                subUrl: null,
            });
        }
    } catch {
        // section folder may not exist
    }

    return result;
}

export async function getFolderMeta(owner, repo, f) {
    const cacheKey = f.submodule ? f.subUrl || f.name : f.path;
    try {
        let o = owner, r = repo, p = f.path;
        if (f.submodule) {
            if (!f.subUrl)
                return metaCache.get(cacheKey) || { logo: null, readme: null };
            const m = normalizeGitUrl(f.subUrl).match(
                /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
            );
            if (!m)
                return metaCache.get(cacheKey) || { logo: null, readme: null };
            o = m[1];
            r = m[2];
            p = "";
        }
        const items = await ghContents(o, r, p);

        // First: recursively find branding folder anywhere in the tree
        const brandingPath = await findBrandingDir(o, r, items);
        let logo = brandingPath
            ? await findLogoRecursive(o, r, brandingPath)
            : null;

        // Fallback: check root-level images
        if (!logo) logo = pickImg(items);

        // Last resort: one level deep in dirs with scripts (e.g. src/, assets/)
        if (!logo) {
            for (const sub of items.filter((i) => i.type === "dir")) {
                try {
                    const subItems = await ghContents(o, r, sub.path);
                    const hasScript = subItems.some(
                        (i) =>
                            i.type === "file" && /\.(css|js)$/i.test(i.name),
                    );
                    if (hasScript) {
                        const found = pickImg(subItems);
                        if (found) {
                            logo = found;
                            break;
                        }
                    }
                } catch {
                    /* skip */
                }
            }
        }

        const rm = items.find(
            (i) => i.type === "file" && /^readme\.md$/i.test(i.name),
        );
        const result = {
            logo,
            readme: rm ? rm.download_url : null,
        };
        metaCache.set(cacheKey, result);
        return result;
    } catch {
        // GitHub unavailable — return cached data as fallback
        return metaCache.get(cacheKey) || { logo: null, readme: null };
    }
}

// ── README proxy ──

const readmeCache = new Map();

export async function fetchReadme(url) {
    try {
        const r = await httpsGet(url);
        if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode}`);
        const md = r.body.toString();
        readmeCache.set(url, md);
        return md;
    } catch {
        // GitHub unavailable — return cached data as fallback
        return readmeCache.get(url) || "";
    }
}
