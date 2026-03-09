const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

const PORT = 5037;
const GITHUB_OWNER = "Web-Next-Music";
const GITHUB_REPO = "Next-Music-Extensions";

const { getPaths } = require("../../config.js");
const { addonsDirectory } = getPaths();

if (!fs.existsSync(addonsDirectory))
    fs.mkdirSync(addonsDirectory, { recursive: true });

const PUBLIC_DIR = path.join(__dirname, "public");

// ─── GitHub network ───────────────────────────────────────────────────────────

function httpsGet(url, headers = {}, timeout = 15000) {
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

async function ghContents(owner, repo, p) {
    const url = p
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${p}`
        : `https://api.github.com/repos/${owner}/${repo}/contents`;
    const r = await httpsGet(url);
    const data = JSON.parse(r.body.toString());
    if (r.statusCode !== 200)
        throw new Error(`GitHub ${r.statusCode}: ${data.message || url}`);
    return data;
}

async function resolveSubmoduleUrl(owner, repo, itemPath) {
    try {
        const r = await httpsGet(
            `https://api.github.com/repos/${owner}/${repo}/contents/${itemPath}`,
        );
        return JSON.parse(r.body.toString()).submodule_git_url || null;
    } catch {
        return null;
    }
}

function normalizeGitUrl(url) {
    if (!url) return null;
    return url
        .replace(/^git:\/\/github\.com\//, "https://github.com/")
        .replace(/^git@github\.com:/, "https://github.com/");
}

function parseGitmodules(text) {
    const map = {};
    const blocks = text.split(/(?=\[submodule\s+"[^"]*"\])/);
    for (const block of blocks) {
        const pm = block.match(/path\s*=\s*(.+)/);
        const um = block.match(/url\s*=\s*(.+)/);
        if (pm && um) map[pm[1].trim()] = um[1].trim();
    }
    return map;
}

async function loadGitmodules(owner, repo) {
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

// Limit concurrent GitHub API requests to avoid rate limiting
async function pLimit(tasks, limit = 3) {
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

// Cache for getFolderMeta results
const metaCache = new Map();

async function downloadTree(contentPath, destDir, owner, repo, gitmodules) {
    const items = await ghContents(owner, repo, contentPath);
    fs.mkdirSync(destDir, { recursive: true });
    for (const item of items) {
        if (item.type === "file") {
            const r = await httpsGet(item.download_url);
            fs.writeFileSync(path.join(destDir, item.name), r.body);
        } else if (item.type === "dir") {
            await downloadTree(
                item.path,
                path.join(destDir, item.name),
                owner,
                repo,
                gitmodules,
            );
        } else if (item.type === "submodule" || item.type === "commit") {
            const rawUrl =
                gitmodules[item.path] ||
                (await resolveSubmoduleUrl(owner, repo, item.path)) ||
                "";
            const subUrl = normalizeGitUrl(rawUrl);
            const m =
                subUrl &&
                subUrl.match(
                    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
                );
            if (m) {
                const subGm = await loadGitmodules(m[1], m[2]);
                await downloadTree(
                    "",
                    path.join(destDir, item.name),
                    m[1],
                    m[2],
                    subGm,
                );
            }
        }
    }
}

async function getSection(section) {
    const gitmodules = await loadGitmodules(GITHUB_OWNER, GITHUB_REPO);
    const prefix = section + "/";
    const result = [];
    const seenNames = new Set();

    // 1. Submodules from .gitmodules
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

    // 2. Regular dirs from GitHub Contents API
    try {
        const items = await ghContents(GITHUB_OWNER, GITHUB_REPO, section);
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

async function getFolderMeta(f) {
    const cacheKey = f.submodule ? f.subUrl || f.name : f.path;
    if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);
    try {
        let owner = GITHUB_OWNER,
            repo = GITHUB_REPO,
            p = f.path;
        if (f.submodule) {
            if (!f.subUrl) return { logo: null, readme: null };
            const m = normalizeGitUrl(f.subUrl).match(
                /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
            );
            if (!m) return { logo: null, readme: null };
            owner = m[1];
            repo = m[2];
            p = "";
        }
        const items = await ghContents(owner, repo, p);

        // Pick best image from a list: image.* > icon.* > any image file
        function pickImg(list) {
            const isImg = (n) => /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
            return (
                list.find(
                    (i) =>
                        i.type === "file" &&
                        /^image\./i.test(i.name) &&
                        isImg(i.name),
                ) ||
                list.find(
                    (i) =>
                        i.type === "file" &&
                        /^icon\./i.test(i.name) &&
                        isImg(i.name),
                ) ||
                list.find((i) => i.type === "file" && isImg(i.name)) ||
                null
            );
        }

        // 1. Try root first
        let img = pickImg(items);

        // 2. If not found, look inside subdirs that contain .css or .js files
        if (!img) {
            const subdirs = items.filter((i) => i.type === "dir");
            for (const sub of subdirs) {
                try {
                    const subItems = await ghContents(owner, repo, sub.path);
                    const hasScript = subItems.some(
                        (i) => i.type === "file" && /\.(css|js)$/i.test(i.name),
                    );
                    if (hasScript) {
                        const found = pickImg(subItems);
                        if (found) {
                            img = found;
                            break;
                        }
                    }
                } catch {
                    /* skip inaccessible subdir */
                }
            }
        }

        const rm = items.find(
            (i) => i.type === "file" && /^readme\.md$/i.test(i.name),
        );
        const result = {
            logo: img ? img.download_url : null,
            readme: rm ? rm.download_url : null,
        };
        metaCache.set(cacheKey, result);
        return result;
    } catch {
        return { logo: null, readme: null };
    }
}

// ─── Submodule commit helpers ─────────────────────────────────────────────────

async function getRemoteHeadCommit(owner, repo) {
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

function getLocalCommitHash(addonName) {
    try {
        const raw =
            fs
                .readdirSync(addonsDirectory)
                .find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() ===
                        addonName.toLowerCase(),
                ) || addonName;
        const headFile = path.join(addonsDirectory, raw, ".git", "HEAD");
        if (!fs.existsSync(headFile)) {
            // Try packed-refs or ORIG_HEAD for non-full clones
            const commitFile = path.join(addonsDirectory, raw, ".git-commit");
            if (fs.existsSync(commitFile))
                return fs.readFileSync(commitFile, "utf8").trim();
            return null;
        }
        const head = fs.readFileSync(headFile, "utf8").trim();
        // Detached HEAD — directly contains the commit SHA
        if (!head.startsWith("ref:")) return head.length >= 40 ? head : null;
        const refPath = head.slice(5).trim(); // e.g. refs/heads/main
        const refFile = path.join(
            addonsDirectory,
            raw,
            ".git",
            ...refPath.split("/"),
        );
        if (fs.existsSync(refFile))
            return fs.readFileSync(refFile, "utf8").trim();
        // Try packed-refs
        const packedRefs = path.join(
            addonsDirectory,
            raw,
            ".git",
            "packed-refs",
        );
        if (fs.existsSync(packedRefs)) {
            const lines = fs.readFileSync(packedRefs, "utf8").split("\n");
            for (const line of lines) {
                if (line.endsWith(refPath)) return line.split(" ")[0].trim();
            }
        }
        return null;
    } catch {
        return null;
    }
}

// ─── FS helpers ───────────────────────────────────────────────────────────────

function installedEntries() {
    try {
        return fs.readdirSync(addonsDirectory).map((n) => ({
            name: n.replace(/^!/, "").toLowerCase(),
            enabled: !n.startsWith("!"),
        }));
    } catch {
        return [];
    }
}

function findEntry(name) {
    const needle = name.toLowerCase();
    return (
        fs
            .readdirSync(addonsDirectory)
            .find((n) => n.replace(/^!/, "").toLowerCase() === needle) || null
    );
}

function fsToggle(name) {
    const found = findEntry(name);
    if (!found) throw new Error("Not found: " + name);
    const disabled = found.startsWith("!");
    fs.renameSync(
        path.join(addonsDirectory, found),
        path.join(addonsDirectory, disabled ? found.slice(1) : "!" + found),
    );
    return !disabled;
}

function fsDelete(name) {
    const found = findEntry(name);
    if (found)
        fs.rmSync(path.join(addonsDirectory, found), {
            recursive: true,
            force: true,
        });
}

function getCustomEntries(knownNames) {
    try {
        const knownSet = new Set(knownNames.map((n) => n.toLowerCase()));
        return fs
            .readdirSync(addonsDirectory)
            .filter((n) => !knownSet.has(n.replace(/^!/, "").toLowerCase()))
            .map((n) => {
                const clean = n.replace(/^!/, "");
                const enabled = !n.startsWith("!");
                const fullPath = path.join(addonsDirectory, n);
                const isDir = fs.statSync(fullPath).isDirectory();
                let logo = null,
                    readme = null;
                if (isDir) {
                    const files = fs.readdirSync(fullPath);

                    // Pick best image: image.* > icon.* > any image
                    const isImgFile = (f) =>
                        /\.(png|jpe?g|gif|webp|svg)$/i.test(f);
                    function pickImgFile(list) {
                        return (
                            list.find(
                                (f) => /^image\./i.test(f) && isImgFile(f),
                            ) ||
                            list.find(
                                (f) => /^icon\./i.test(f) && isImgFile(f),
                            ) ||
                            list.find((f) => isImgFile(f)) ||
                            null
                        );
                    }

                    // 1. Try root
                    let imgFile = pickImgFile(files);

                    // 2. Search inside subdirs that contain .css or .js
                    if (!imgFile) {
                        const subdirs = files.filter((f) => {
                            try {
                                return fs
                                    .statSync(path.join(fullPath, f))
                                    .isDirectory();
                            } catch {
                                return false;
                            }
                        });
                        for (const sub of subdirs) {
                            const subPath = path.join(fullPath, sub);
                            try {
                                const subFiles = fs.readdirSync(subPath);
                                const hasScript = subFiles.some((f) =>
                                    /\.(css|js)$/i.test(f),
                                );
                                if (hasScript) {
                                    const found = pickImgFile(subFiles);
                                    if (found) {
                                        logo = `/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.join(sub, found))}`;
                                        break;
                                    }
                                }
                            } catch {
                                /* skip */
                            }
                        }
                    }

                    if (imgFile && !logo)
                        logo = `/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(imgFile)}`;

                    const rmFile = files.find((f) => /^readme\.md$/i.test(f));
                    if (rmFile)
                        readme = `/api/local-readme?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rmFile)}`;
                }
                return { name: clean, raw: n, enabled, isDir, logo, readme };
            });
    } catch {
        return [];
    }
}

// ─── Skeleton helper ──────────────────────────────────────────────────────────

function SKELS(n) {
    return Array.from(
        { length: n },
        () => `
<div class="card">
  <div class="card-top">
    <div class="skel" style="width:44px;height:44px;border-radius:9px;flex-shrink:0"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px;padding-top:2px">
      <div class="skel" style="width:62%"></div>
      <div class="skel" style="width:36%;height:10px"></div>
    </div>
  </div>
  <div class="skel" style="height:33px;border-radius:8px"></div>
</div>`,
    ).join("");
}

// ─── README cache ─────────────────────────────────────────────────────────────

const readmeCache = new Map();
async function fetchReadme(url) {
    if (readmeCache.has(url)) return readmeCache.get(url);
    const r = await httpsGet(url);
    const md = r.body.toString();
    readmeCache.set(url, md);
    return md;
}

// ─── Static MIME types ────────────────────────────────────────────────────────

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
};

const IMG_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
};

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split("?")[0];
    const qp = Object.fromEntries(new URL("http://x" + req.url).searchParams);

    const send = (d, code = 200, ct = "application/json") => {
        res.writeHead(code, { "Content-Type": ct });
        res.end(typeof d === "string" ? d : JSON.stringify(d));
    };
    const body = () =>
        new Promise((ok) => {
            let b = "";
            req.on("data", (c) => (b += c));
            req.on("end", () => ok(b));
        });

    // ── Serve static files from /public ──
    if (req.method === "GET" && urlPath.startsWith("/public/")) {
        const filePath = path.join(
            PUBLIC_DIR,
            urlPath.slice("/public/".length),
        );
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const ct = MIME[ext] || "application/octet-stream";
            res.writeHead(200, { "Content-Type": ct });
            return res.end(fs.readFileSync(filePath));
        }
        res.writeHead(404);
        return res.end("Not found");
    }

    // ── Serve HTML page ──
    if (req.method === "GET" && urlPath === "/") {
        try {
            const htmlPath = path.join(PUBLIC_DIR, "index.html");
            let html = fs.readFileSync(htmlPath, "utf8");
            html = html
                .replace("SKELS_ADDONS", SKELS(6))
                .replace("SKELS_THEMES", SKELS(6));
            return send(html, 200, "text/html; charset=utf-8");
        } catch (e) {
            return send(
                `<pre>Failed to load page: ${e.message}</pre>`,
                500,
                "text/html",
            );
        }
    }

    // ── API: installed entries (sync FS — must be before any async handlers) ──
    if (req.method === "GET" && urlPath === "/api/installed")
        return send(installedEntries());

    // ── API: custom local entries (sync FS — must be before any async handlers) ──
    if (req.method === "GET" && urlPath === "/api/custom") {
        try {
            const known = qp.known ? JSON.parse(qp.known) : [];
            return send(getCustomEntries(known));
        } catch (e) {
            return send({ error: e.message }, 500);
        }
    }

    // ── API: list repo section ──
    if (req.method === "GET" && urlPath.startsWith("/api/section/")) {
        const section = urlPath.slice("/api/section/".length);
        try {
            const items = await getSection(section);
            const result = await pLimit(
                items.map((f) => async () => {
                    const meta = await getFolderMeta(f);
                    return {
                        name: f.name,
                        path: f.path,
                        submodule: f.submodule,
                        subUrl: f.subUrl,
                        ...meta,
                    };
                }),
                3,
            );
            return send(result);
        } catch (e) {
            return send({ error: e.message }, 500);
        }
    }

    // ── API: proxy remote logo ──
    if (req.method === "GET" && urlPath === "/api/logo") {
        if (!qp.url) {
            res.writeHead(404);
            return res.end();
        }
        try {
            const r = await httpsGet(qp.url);
            res.writeHead(200, {
                "Content-Type": r.headers["content-type"] || "image/png",
            });
            return res.end(r.body);
        } catch {
            res.writeHead(404);
            return res.end();
        }
    }

    // ── API: serve local logo ──
    if (req.method === "GET" && urlPath === "/api/local-logo") {
        try {
            const { name, file } = qp;
            if (!name || !file) {
                res.writeHead(400);
                return res.end();
            }
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find((n) => n.replace(/^!/, "") === name) || name;
            const filePath = path.join(addonsDirectory, raw, file);
            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, {
                "Content-Type":
                    IMG_MIME[path.extname(file).toLowerCase()] || "image/png",
            });
            return res.end(fs.readFileSync(filePath));
        } catch {
            res.writeHead(404);
            return res.end();
        }
    }

    // ── API: serve local README ──
    if (req.method === "GET" && urlPath === "/api/local-readme") {
        try {
            const { name, file } = qp;
            if (!name || !file) {
                res.writeHead(400);
                return res.end();
            }
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find((n) => n.replace(/^!/, "") === name) || name;
            const filePath = path.join(addonsDirectory, raw, file);
            if (!fs.existsSync(filePath)) {
                res.writeHead(404);
                return res.end();
            }
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end(fs.readFileSync(filePath, "utf8"));
        } catch {
            res.writeHead(404);
            return res.end("Not found");
        }
    }

    // ── API: proxy remote README ──
    if (req.method === "GET" && urlPath === "/api/readme") {
        if (!qp.url) {
            res.writeHead(404);
            return res.end();
        }
        try {
            const md = await fetchReadme(qp.url);
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end(md);
        } catch {
            res.writeHead(404);
            return res.end("Not found");
        }
    }

    // ── API: download addon ──
    if (req.method === "POST" && urlPath === "/api/download") {
        try {
            const { name, folderPath, submodule, subUrl } = JSON.parse(
                await body(),
            );
            if (!name) throw new Error("Missing name");
            const dest = path.join(addonsDirectory, name);
            if (submodule && subUrl) {
                const normalized = normalizeGitUrl(subUrl);
                const m =
                    normalized &&
                    normalized.match(
                        /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
                    );
                if (!m)
                    throw new Error("Cannot parse submodule URL: " + subUrl);
                const subGm = await loadGitmodules(m[1], m[2]);
                await downloadTree("", dest, m[1], m[2], subGm);
                // Save remote HEAD commit hash for future update checks
                try {
                    const sha = await getRemoteHeadCommit(m[1], m[2]);
                    if (sha)
                        fs.writeFileSync(
                            path.join(dest, ".git-commit"),
                            sha,
                            "utf8",
                        );
                } catch {
                    /* non-critical */
                }
            } else {
                const gm = await loadGitmodules(GITHUB_OWNER, GITHUB_REPO);
                await downloadTree(
                    folderPath,
                    dest,
                    GITHUB_OWNER,
                    GITHUB_REPO,
                    gm,
                );
            }
            return send({ ok: true });
        } catch (e) {
            return send({ ok: false, error: e.message }, 500);
        }
    }

    // ── API: check for submodule update ──
    if (req.method === "GET" && urlPath === "/api/check-update") {
        try {
            const { name, subUrl } = qp;
            if (!name || !subUrl) return send({ hasUpdate: false });
            const normalized = normalizeGitUrl(decodeURIComponent(subUrl));
            const m =
                normalized &&
                normalized.match(
                    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
                );
            if (!m) return send({ hasUpdate: false });
            const [, owner, repo] = m;
            const [remoteHash, localHash] = await Promise.all([
                getRemoteHeadCommit(owner, repo),
                Promise.resolve(getLocalCommitHash(name)),
            ]);
            const hasUpdate =
                !!remoteHash && !!localHash && remoteHash !== localHash;
            return send({ hasUpdate, remoteHash, localHash });
        } catch (e) {
            return send({ hasUpdate: false, error: e.message });
        }
    }

    // ── API: toggle enable/disable ──
    if (req.method === "POST" && urlPath === "/api/toggle") {
        try {
            const { name } = JSON.parse(await body());
            const enabled = fsToggle(name);
            return send({ ok: true, enabled });
        } catch (e) {
            return send({ ok: false, error: e.message }, 500);
        }
    }

    // ── API: delete addon ──
    if (req.method === "POST" && urlPath === "/api/delete") {
        try {
            const { name } = JSON.parse(await body());
            fsDelete(name);
            return send({ ok: true });
        } catch (e) {
            return send({ ok: false, error: e.message }, 500);
        }
    }

    // ── API: get CSS vars from main window ──
    if (req.method === "GET" && urlPath === "/api/theme-vars") {
        try {
            const wins = BrowserWindow.getAllWindows();
            const mainWin =
                wins.find(
                    (w) =>
                        !w.webContents.getURL().includes("127.0.0.1:" + PORT),
                ) || null;
            if (!mainWin) return send({});

            const vars = await mainWin.webContents.executeJavaScript(`
            (() => {
                const tmp = document.createElement('div');
                const parentStyles = getComputedStyle(document.body);
                const vars = {};
                for (const prop of parentStyles) {
                    if (prop.startsWith('--ym-')) {
                        tmp.style.color = \`var(\${prop})\`;
                        document.body.appendChild(tmp);
                        vars[prop] = getComputedStyle(tmp).color;
                        document.body.removeChild(tmp);
                    }
                }
                return vars;
            })()
            `);

            return send(vars);
        } catch (e) {
            return send({});
        }
    }

    // ── API: reload main window ──
    // ── API: open URL in system browser ──
    if (req.method === "POST" && urlPath === "/api/open-url") {
        try {
            const { url } = JSON.parse(await body());
            if (!url || !url.startsWith("https://"))
                throw new Error("Invalid URL");
            await shell.openExternal(url);
            return send({ ok: true });
        } catch (e) {
            return send({ ok: false, error: e.message }, 500);
        }
    }

    if (req.method === "POST" && urlPath === "/api/reload") {
        try {
            const wins = BrowserWindow.getAllWindows();
            if (wins.length > 0) {
                // Reload the focused/main window (not the store webview)
                const mainWin =
                    wins.find(
                        (w) =>
                            !w.webContents
                                .getURL()
                                .includes("127.0.0.1:" + PORT),
                    ) || wins[0];
                mainWin.webContents.reload();
            }
            return send({ ok: true });
        } catch (e) {
            return send({ ok: false, error: e.message }, 500);
        }
    }

    res.writeHead(404);
    res.end("Not found");
});

function setupStorePage() {
    server.listen(PORT, "127.0.0.1", () => {
        console.log(`[Store] Running at http://127.0.0.1:${PORT}`);
    });
}

module.exports = { setupStorePage, server, addonsDirectory };
