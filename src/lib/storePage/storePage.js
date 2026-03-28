import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { BrowserWindow, shell, protocol } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_OWNER = "Web-Next-Music";
const GITHUB_REPO = "Next-Music-Extensions";

import { getPaths } from "../../config.js";
const { addonsDirectory } = getPaths();

import {
    t as langT,
    getCurrentLangCode,
    getAvailableLanguages,
} from "../langManager.js";
import { getConfig } from "../configManager.js";

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

        let img = pickImg(items);

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
                    // skip inaccessible subdir
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
            const commitFile = path.join(addonsDirectory, raw, ".git-commit");
            if (fs.existsSync(commitFile))
                return fs.readFileSync(commitFile, "utf8").trim();
            return null;
        }
        const head = fs.readFileSync(headFile, "utf8").trim();
        if (!head.startsWith("ref:")) return head.length >= 40 ? head : null;
        const refPath = head.slice(5).trim();
        const refFile = path.join(
            addonsDirectory,
            raw,
            ".git",
            ...refPath.split("/"),
        );
        if (fs.existsSync(refFile))
            return fs.readFileSync(refFile, "utf8").trim();
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

                    let imgFile = pickImgFile(files);

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
                                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.join(sub, found))}`;
                                        break;
                                    }
                                }
                            } catch {
                                // skip
                            }
                        }
                    }

                    if (imgFile && !logo)
                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(imgFile)}`;

                    const rmFile = files.find((f) => /^readme\.md$/i.test(f));
                    if (rmFile)
                        readme = `nextstore://app/api/local-readme?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rmFile)}`;
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

// ─── Request handler (shared logic, replaces HTTP server) ─────────────────────

async function handleRequest(method, urlPath, qp, getBody) {
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
    const binary = (buf, ct) => ({
        status: 200,
        headers: { "Content-Type": ct },
        body: buf,
    });
    const notFound = () => ({
        status: 404,
        headers: {},
        body: Buffer.alloc(0),
    });

    // ── Static files ──
    if (method === "GET" && urlPath.startsWith("/public/")) {
        const filePath = path.join(
            PUBLIC_DIR,
            urlPath.slice("/public/".length),
        );
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const ct = MIME[ext] || "application/octet-stream";
            return binary(fs.readFileSync(filePath), ct);
        }
        return notFound();
    }

    // ── Installed entries ──
    if (method === "GET" && urlPath === "/api/installed")
        return json(installedEntries());

    // ── Custom local entries ──
    if (method === "GET" && urlPath === "/api/custom") {
        try {
            const known = qp.known ? JSON.parse(qp.known) : [];
            return json(getCustomEntries(known));
        } catch (e) {
            return json({ error: e.message }, 500);
        }
    }

    // ── List repo section ──
    if (method === "GET" && urlPath.startsWith("/api/section/")) {
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
            return json(result);
        } catch (e) {
            return json({ error: e.message }, 500);
        }
    }

    // ── Proxy remote logo ──
    if (method === "GET" && urlPath === "/api/logo") {
        if (!qp.url) return notFound();
        try {
            const r = await httpsGet(qp.url);
            return binary(r.body, r.headers["content-type"] || "image/png");
        } catch {
            return notFound();
        }
    }

    // ── Serve local logo ──
    if (method === "GET" && urlPath === "/api/local-logo") {
        try {
            const { name, file } = qp;
            if (!name || !file) return notFound();
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find((n) => n.replace(/^!/, "") === name) || name;
            const filePath = path.join(addonsDirectory, raw, file);
            if (!fs.existsSync(filePath)) return notFound();
            return binary(
                fs.readFileSync(filePath),
                IMG_MIME[path.extname(file).toLowerCase()] || "image/png",
            );
        } catch {
            return notFound();
        }
    }

    // ── Serve local README ──
    if (method === "GET" && urlPath === "/api/local-readme") {
        try {
            const { name, file } = qp;
            if (!name || !file) return notFound();
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find((n) => n.replace(/^!/, "") === name) || name;
            const filePath = path.join(addonsDirectory, raw, file);
            if (!fs.existsSync(filePath)) return notFound();
            return text(fs.readFileSync(filePath, "utf8"));
        } catch {
            return notFound();
        }
    }

    // ── Proxy remote README ──
    if (method === "GET" && urlPath === "/api/readme") {
        if (!qp.url) return notFound();
        try {
            const md = await fetchReadme(qp.url);
            return text(md);
        } catch {
            return notFound();
        }
    }

    // ── Download addon ──
    if (method === "POST" && urlPath === "/api/download") {
        try {
            const { name, folderPath, submodule, subUrl } = JSON.parse(
                await getBody(),
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
                try {
                    const sha = await getRemoteHeadCommit(m[1], m[2]);
                    if (sha)
                        fs.writeFileSync(
                            path.join(dest, ".git-commit"),
                            sha,
                            "utf8",
                        );
                } catch {
                    // non-critical
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
            return json({ ok: true });
        } catch (e) {
            return json({ ok: false, error: e.message }, 500);
        }
    }

    // ── Check for submodule update ──
    if (method === "GET" && urlPath === "/api/check-update") {
        try {
            const { name, subUrl } = qp;
            if (!name || !subUrl) return json({ hasUpdate: false });
            const normalized = normalizeGitUrl(decodeURIComponent(subUrl));
            const m =
                normalized &&
                normalized.match(
                    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
                );
            if (!m) return json({ hasUpdate: false });
            const [, owner, repo] = m;
            const [remoteHash, localHash] = await Promise.all([
                getRemoteHeadCommit(owner, repo),
                Promise.resolve(getLocalCommitHash(name)),
            ]);
            const hasUpdate =
                !!remoteHash && !!localHash && remoteHash !== localHash;
            return json({ hasUpdate, remoteHash, localHash });
        } catch (e) {
            return json({ hasUpdate: false, error: e.message });
        }
    }

    // ── Toggle enable/disable ──
    if (method === "POST" && urlPath === "/api/toggle") {
        try {
            const { name } = JSON.parse(await getBody());
            const enabled = fsToggle(name);
            return json({ ok: true, enabled });
        } catch (e) {
            return json({ ok: false, error: e.message }, 500);
        }
    }

    // ── Delete addon ──
    if (method === "POST" && urlPath === "/api/delete") {
        try {
            const { name } = JSON.parse(await getBody());
            fsDelete(name);
            return json({ ok: true });
        } catch (e) {
            return json({ ok: false, error: e.message }, 500);
        }
    }

    // ── Serve current language JSON to the store UI ──
    if (method === "GET" && urlPath === "/api/lang") {
        try {
            const { languagesDirectory } = getPaths();
            const config = getConfig();
            const langCode =
                config?.programSettings?.language ||
                getCurrentLangCode() ||
                "en";
            console.log(
                "[Store /api/lang] langCode:",
                langCode,
                "dir:",
                languagesDirectory,
            );
            const langFile = path.join(languagesDirectory, `${langCode}.json`);
            if (fs.existsSync(langFile)) {
                console.log("[Store /api/lang] serving:", langFile);
                return text(
                    fs.readFileSync(langFile, "utf-8"),
                    "application/json; charset=utf-8",
                );
            }
            const enFile = path.join(languagesDirectory, "en.json");
            if (fs.existsSync(enFile)) {
                console.log("[Store /api/lang] fallback to en:", enFile);
                return text(
                    fs.readFileSync(enFile, "utf-8"),
                    "application/json; charset=utf-8",
                );
            }
            console.warn(
                "[Store /api/lang] no lang file found in:",
                languagesDirectory,
            );
            return json({ error: "Language file not found" }, 404);
        } catch (e) {
            console.error("[Store /api/lang] error:", e.message);
            return json({ error: e.message }, 500);
        }
    }

    // ── Get CSS vars from main window ──
    if (method === "GET" && urlPath === "/api/theme-vars") {
        try {
            const wins = BrowserWindow.getAllWindows();
            const mainWin =
                wins.find((w) => {
                    const url = w.webContents.getURL();
                    return (
                        url.includes("music.yandex") ||
                        url.includes("music.yandex.ru")
                    );
                }) ||
                wins.find((w) => {
                    const url = w.webContents.getURL();
                    return (
                        !url.includes("nextstore://") &&
                        !url.startsWith("file://")
                    );
                }) ||
                null;
            if (!mainWin) return json({});
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
            })()`);
            return json(vars);
        } catch {
            return json({});
        }
    }

    // ── Open URL in system browser ──
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

    // ── Reload main window ──
    if (method === "POST" && urlPath === "/api/reload") {
        try {
            const wins = BrowserWindow.getAllWindows();
            const mainWin =
                wins.find(
                    (w) => !w.webContents.getURL().includes("nextstore://"),
                ) || wins[0];
            if (mainWin) mainWin.webContents.reload();
            return json({ ok: true });
        } catch (e) {
            return json({ ok: false, error: e.message }, 500);
        }
    }

    // ── Check if handleEvents.json exists for an addon ──
    if (method === "GET" && urlPath === "/api/check-handle-events") {
        try {
            const { name } = qp;
            if (!name) return json({ exists: false });
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find(
                        (n) =>
                            n.replace(/^!/, "").toLowerCase() ===
                            name.toLowerCase(),
                    ) || null;
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

    // ── Read handleEvents.json content ──
    if (method === "GET" && urlPath === "/api/read-handle-events") {
        try {
            const { name } = qp;
            if (!name) throw new Error("Missing name");
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find(
                        (n) =>
                            n.replace(/^!/, "").toLowerCase() ===
                            name.toLowerCase(),
                    ) || null;
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

    // ── Save handleEvents.json content ──
    if (method === "POST" && urlPath === "/api/save-handle-events") {
        try {
            const { name, content } = JSON.parse(await getBody());
            if (!name) throw new Error("Missing name");
            // Validate JSON before saving
            JSON.parse(content);
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find(
                        (n) =>
                            n.replace(/^!/, "").toLowerCase() ===
                            name.toLowerCase(),
                    ) || null;
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

    // ── Open handleEvents.json in default text editor (fallback) ──
    if (method === "POST" && urlPath === "/api/open-handle-events") {
        try {
            const { name } = JSON.parse(await getBody());
            if (!name) throw new Error("Missing name");
            const raw =
                fs
                    .readdirSync(addonsDirectory)
                    .find(
                        (n) =>
                            n.replace(/^!/, "").toLowerCase() ===
                            name.toLowerCase(),
                    ) || null;
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

// ─── Electron protocol handler ────────────────────────────────────────────────

function setupStorePage() {
    protocol.handle("nextstore", async (request) => {
        const url = new URL(request.url);
        const urlPath = url.pathname;
        const qp = Object.fromEntries(url.searchParams);
        const method = request.method;

        const getBody = () =>
            request
                .arrayBuffer()
                .then((ab) => Buffer.from(ab).toString("utf8"));

        try {
            const result = await handleRequest(method, urlPath, qp, getBody);
            return new Response(result.body, {
                status: result.status,
                headers: result.headers,
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    });
}

// ─── HTML injection ───────────────────────────────────────────────────────────

function getStoreHtml() {
    const htmlPath = path.join(PUBLIC_DIR, "index.html");
    let html = fs.readFileSync(htmlPath, "utf8");
    html = html
        .replace("SKELS_ADDONS", SKELS(6))
        .replace("SKELS_THEMES", SKELS(6))
        .replace(
            /\/(public\/[^"']+)/g,
            (_, p) =>
                pathToFileURL(path.join(PUBLIC_DIR, p.replace(/^public\//, "")))
                    .href,
        )
        .replace("<head>", `<head>\n        <base href="nextstore://app/">`);
    return html;
}

function injectStoreHtml(win) {
    const html = getStoreHtml();
    win.webContents.executeJavaScript(
        `window.__nextStoreHtml = ${JSON.stringify(html)};`,
    );
}

export { setupStorePage, getStoreHtml, injectStoreHtml, addonsDirectory };
