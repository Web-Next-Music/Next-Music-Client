import fs from "fs";
import path from "path";
import { BrowserWindow, shell } from "electron";

import {
    GITHUB_OWNER,
    GITHUB_REPO,
    httpsGet,
    normalizeGitUrl,
    loadGitmodules,
    getSection,
    getFolderMeta,
    getRemoteHeadCommit,
    getLatestNmRelease,
    fetchReadme,
    pLimit,
} from "./github.js";

import {
    downloadTree,
    downloadAndExtractTarGz,
    downloadSourceZip,
} from "./download.js";

import {
    readOldHandleEvents,
    applyHandleEventsMerge,
} from "./handleEvents.js";

import {
    addonsDirectory,
    getLocalReleaseTag,
    getLocalCommitHash,
    installedEntries,
    findEntry,
    fsToggle,
    fsDelete,
    getCustomEntries,
} from "./filesystem.js";

import { getPaths } from "../../config.js";
import { getCurrentLangCode } from "../langManager.js";
import { getConfig } from "../configManager.js";

// ── Response helpers ──

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

// ── MIME types ──

const IMG_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
};

// ── Main request handler ──

export async function handleRequest(method, urlPath, qp, getBody, PUBLIC_DIR) {
    const MIME = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css",
        ".js": "application/javascript",
    };

    // ── Static files ──
    if (method === "GET" && urlPath.startsWith("/public/")) {
        const filePath = path.join(PUBLIC_DIR, urlPath.slice("/public/".length));
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            return binary(fs.readFileSync(filePath), MIME[ext] || "application/octet-stream");
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
            const items = await getSection(GITHUB_OWNER, GITHUB_REPO, section);
            const result = await pLimit(
                items.map((f) => async () => {
                    const meta = await getFolderMeta(GITHUB_OWNER, GITHUB_REPO, f);
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
                fs.readdirSync(addonsDirectory).find(
                    (n) => n.replace(/^!/, "") === name,
                ) || name;
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
                fs.readdirSync(addonsDirectory).find(
                    (n) => n.replace(/^!/, "") === name,
                ) || name;
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

    // ── Download / update addon ──
    if (method === "POST" && urlPath === "/api/download") {
        try {
            const { name, folderPath, submodule, subUrl } = JSON.parse(
                await getBody(),
            );
            if (!name) throw new Error("Missing name");
            const dest = path.join(addonsDirectory, name);

            // Preserve handleEvents.json BEFORE the update overwrites the directory
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

                const nmRelease = await getLatestNmRelease(subOwner, subRepo);
                if (nmRelease) {
                    fs.mkdirSync(dest, { recursive: true });
                    await downloadAndExtractTarGz(nmRelease.downloadUrl, dest);
                    fs.writeFileSync(
                        path.join(dest, ".git-release"),
                        nmRelease.tag,
                        "utf8",
                    );
                } else {
                    fs.mkdirSync(dest, { recursive: true });
                    await downloadSourceZip(subOwner, subRepo, dest);
                    try {
                        const sha = await getRemoteHeadCommit(subOwner, subRepo);
                        if (sha)
                            fs.writeFileSync(
                                path.join(dest, ".git-commit"),
                                sha,
                                "utf8",
                            );
                    } catch {
                        // non-critical
                    }
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

            // Merge preserved handleEvents values into the freshly installed version
            applyHandleEventsMerge(dest, oldHandleEvents);

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

            const localTag = getLocalReleaseTag(name);
            if (localTag) {
                const nmRelease = await getLatestNmRelease(owner, repo);
                if (!nmRelease) return json({ hasUpdate: false });
                const hasUpdate = nmRelease.tag !== localTag;
                return json({
                    hasUpdate,
                    remoteHash: nmRelease.tag,
                    localHash: localTag,
                });
            }

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
            console.log("[Store /api/lang] langCode:", langCode, "dir:", languagesDirectory);
            const langFile = path.join(languagesDirectory, `${langCode}.json`);
            if (fs.existsSync(langFile)) {
                console.log("[Store /api/lang] serving:", langFile);
                return text(fs.readFileSync(langFile, "utf-8"), "application/json; charset=utf-8");
            }
            const enFile = path.join(languagesDirectory, "en.json");
            if (fs.existsSync(enFile)) {
                console.log("[Store /api/lang] fallback to en:", enFile);
                return text(fs.readFileSync(enFile, "utf-8"), "application/json; charset=utf-8");
            }
            console.warn("[Store /api/lang] no lang file found in:", languagesDirectory);
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
                    return url.includes("music.yandex") || url.includes("music.yandex.ru");
                }) ||
                wins.find((w) => {
                    const url = w.webContents.getURL();
                    return !url.includes("nextstore://") && !url.startsWith("file://");
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
                fs.readdirSync(addonsDirectory).find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() === name.toLowerCase(),
                ) || null;
            if (!raw) return json({ exists: false });
            const filePath = path.join(addonsDirectory, raw, "handleEvents.json");
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
                fs.readdirSync(addonsDirectory).find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() === name.toLowerCase(),
                ) || null;
            if (!raw) throw new Error("Addon not found: " + name);
            const filePath = path.join(addonsDirectory, raw, "handleEvents.json");
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
            JSON.parse(content); // validate JSON before saving
            const raw =
                fs.readdirSync(addonsDirectory).find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() === name.toLowerCase(),
                ) || null;
            if (!raw) throw new Error("Addon not found: " + name);
            const filePath = path.join(addonsDirectory, raw, "handleEvents.json");
            if (!fs.existsSync(filePath))
                throw new Error("handleEvents.json not found");
            fs.writeFileSync(filePath, content, "utf8");
            return json({ ok: true });
        } catch (e) {
            return json({ ok: false, error: e.message }, 500);
        }
    }

    // ── Open handleEvents.json in default text editor ──
    if (method === "POST" && urlPath === "/api/open-handle-events") {
        try {
            const { name } = JSON.parse(await getBody());
            if (!name) throw new Error("Missing name");
            const raw =
                fs.readdirSync(addonsDirectory).find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() === name.toLowerCase(),
                ) || null;
            if (!raw) throw new Error("Addon not found: " + name);
            const filePath = path.join(addonsDirectory, raw, "handleEvents.json");
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
