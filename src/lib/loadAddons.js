import { loadConfig, getPaths } from "../config.js";
import fs from "fs";
import path from "path";
import http from "http";

const { addonsDirectory } = getPaths();
const config = loadConfig();

// ─── Asset server ────────────────────────────────────────────────────────────

// Mapping: addon name (folder) → absolute path to addon folder
const ADDON_DIRS = new Map();
let serverStarted = false;
let assetServerPort = 2007; // may shift if port is busy

/**
 * Safely decode a URI component; returns null on failure.
 */
function safeDecodeURI(str) {
    if (!str) return null;
    try {
        return decodeURIComponent(str.replace(/\+/g, " "));
    } catch {
        return null;
    }
}

/**
 * Prevent path-traversal: resolve the target and assert it stays inside root.
 * Returns the resolved absolute path or null if the check fails.
 */
function safeResolve(root, ...segments) {
    const resolved = path.resolve(root, ...segments);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
        return null;
    }
    return resolved;
}

/**
 * Find the first directory named `assets` inside `dir` (recursive, BFS-order).
 * Returns the absolute path or null.
 */
function findAssetsDir(dir) {
    if (!fs.existsSync(dir)) return null;

    const queue = [dir];
    while (queue.length) {
        const current = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            try {
                // Follow symlinks
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (entry.name === "assets") return fullPath;
                    queue.push(fullPath);
                }
            } catch {
                // Broken symlink or permission error – skip silently
            }
        }
    }
    return null;
}

/**
 * Find the first file named `fileName` anywhere inside `dir` (recursive).
 * Returns the absolute path or null.
 */
function findFileRecursive(dir, fileName) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && entry.name === fileName) return fullPath;
            if (stat.isDirectory()) {
                const found = findFileRecursive(fullPath, fileName);
                if (found) return found;
            }
        } catch {
            // Skip inaccessible entries
        }
    }
    return null;
}

/**
 * Find `handleEvents.json` for an addon.
 * Priority: file next to the `assets` folder, then anywhere in the addon dir.
 */
function findHandleFile(addonDir) {
    if (!fs.existsSync(addonDir)) return null;

    // Look for a sibling of the assets folder first
    const queue = [addonDir];
    while (queue.length) {
        const current = queue.shift();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (entry.name === "assets") {
                        const candidate = path.join(
                            current,
                            "handleEvents.json",
                        );
                        if (fs.existsSync(candidate)) return candidate;
                    }
                    queue.push(fullPath);
                }
            } catch {}
        }
    }

    // Fallback: anywhere in the addon dir
    return findFileRecursive(addonDir, "handleEvents.json");
}

/**
 * Attempt to start the HTTP asset server.
 * If the preferred port is busy, automatically retries on the next port (up to 10 attempts).
 */
function startAssetServer(preferredPort = 2007, attempt = 0) {
    if (serverStarted) return;

    const port = preferredPort + attempt;

    if (attempt >= 10) {
        console.error(
            "[Assets] Could not bind to any port in range",
            preferredPort,
            "–",
            port - 1,
        );
        return;
    }

    const server = http.createServer((req, res) => {
        // ── Helpers ──────────────────────────────────────────────────────────

        function send(status, body, headers = {}) {
            res.writeHead(status, { "Content-Type": "text/plain", ...headers });
            res.end(body);
        }

        // ── Parse URL ────────────────────────────────────────────────────────

        let parsed;
        try {
            parsed = new URL(req.url, `http://127.0.0.1:${assetServerPort}`);
        } catch {
            return send(400, "Bad URL");
        }

        const pathname = parsed.pathname;
        const name = safeDecodeURI(parsed.searchParams.get("name"));

        // ── GET /assets/<filename>?name=<addon> ──────────────────────────────

        if (pathname.startsWith("/assets/")) {
            const rawFile = pathname.slice("/assets/".length);
            const fileName = safeDecodeURI(rawFile);

            if (!fileName) return send(400, "Bad filename encoding");
            if (!name) return send(400, "Missing name parameter");

            // Reject path-traversal in the filename itself
            if (fileName.includes("..") || path.isAbsolute(fileName)) {
                return send(400, "Invalid filename");
            }

            const addonDir = ADDON_DIRS.get(name);
            if (!addonDir) return send(404, `Addon '${name}' not found`);

            const assetsRoot = findAssetsDir(addonDir);
            if (!assetsRoot)
                return send(404, "Assets folder not found for addon");

            // Only search by file name (last segment) to avoid traversal
            const safeFileName = path.basename(fileName);
            const filePath = findFileRecursive(assetsRoot, safeFileName);

            if (!filePath)
                return send(404, `File '${safeFileName}' not found in assets`);

            // Double-check the resolved path is still inside assetsRoot
            if (!filePath.startsWith(assetsRoot + path.sep)) {
                return send(403, "Forbidden");
            }

            const stream = fs.createReadStream(filePath);
            stream.on("error", (err) => {
                console.error("[Assets] Stream error:", err);
                if (!res.headersSent) send(500, "Read error");
            });
            res.writeHead(200);
            stream.pipe(res);
            return;
        }

        // ── download_asset ───────────────────────────────────────────────────
        if (pathname === "/download_asset" && req.method === "POST") {
            if (!name) return send(400, "Missing name parameter");
            const addonDir = path.join(addonsDirectory, name);
            let assetsRoot = findAssetsDir(addonDir);
            // Если папки assets ещё нет — создаём её
            if (!assetsRoot) {
                assetsRoot = path.join(addonDir, "assets");
                try {
                    fs.mkdirSync(assetsRoot, { recursive: true });
                } catch (err) {
                    console.error(
                        "[download_asset] Cannot create assets dir:",
                        err,
                    );
                    return send(500, "Cannot create assets directory");
                }
            }
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", async () => {
                let url, fileName;
                try {
                    ({ url, fileName } = JSON.parse(body));
                } catch {
                    return send(400, "Invalid JSON body");
                }
                if (!url || typeof url !== "string")
                    return send(400, "Missing url");
                if (!fileName || typeof fileName !== "string")
                    return send(400, "Missing fileName");
                const safeFileName = path.basename(fileName);
                if (!safeFileName) return send(400, "Invalid fileName");
                const destPath = safeResolve(assetsRoot, safeFileName);
                if (!destPath)
                    return send(400, "Invalid fileName (traversal detected)");
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(
                        () => controller.abort(),
                        FETCH_TIMEOUT_MS,
                    );
                    let fetchRes;
                    try {
                        fetchRes = await fetch(url, {
                            signal: controller.signal,
                        });
                    } finally {
                        clearTimeout(timer);
                    }
                    if (!fetchRes.ok) {
                        return send(
                            502,
                            `Fetch failed: HTTP ${fetchRes.status}`,
                        );
                    }
                    const buffer = Buffer.from(await fetchRes.arrayBuffer());
                    fs.writeFileSync(destPath, buffer);
                    console.log(
                        `[download_asset] Saved '${safeFileName}' → ${destPath}`,
                    );
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(
                        JSON.stringify({
                            ok: true,
                            fileName: safeFileName,
                            path: destPath,
                        }),
                    );
                } catch (err) {
                    console.error("[download_asset] Error:", err);
                    if (!res.headersSent)
                        send(500, `Download error: ${err.message}`);
                }
            });
            return;
        }

        // ── GET /get_handle?name=<addon> ─────────────────────────────────────

        if (pathname === "/get_handle") {
            if (!name) return send(400, "Missing name parameter");

            const addonDir = ADDON_DIRS.get(name);
            if (!addonDir) return send(404, `Addon '${name}' not found`);

            const handleFile = findHandleFile(addonDir);
            if (!handleFile) {
                console.error(
                    "[get_handle] handleEvents.json not found in:",
                    addonDir,
                );
                return send(404, "handleEvents.json not found");
            }

            fs.readFile(handleFile, "utf8", (err, fileContent) => {
                if (err) {
                    console.error("[get_handle] Read error:", err);
                    return send(500, "Server error");
                }
                try {
                    const parsedData = JSON.parse(fileContent);
                    const wrapped = JSON.stringify({ data: parsedData });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(wrapped);
                } catch (e) {
                    console.error("[get_handle] Invalid JSON:", e);
                    send(500, "Invalid JSON in handleEvents.json");
                }
            });
            return;
        }

        // ── Fallback ─────────────────────────────────────────────────────────

        send(404, "Not found");
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.warn(`[Assets] Port ${port} is busy, trying ${port + 1}…`);
            startAssetServer(preferredPort, attempt + 1);
        } else {
            console.error("[Assets] Server error:", err);
        }
    });

    server.listen(port, "127.0.0.1", () => {
        serverStarted = true;
        assetServerPort = port;
        console.log(`[Assets] Server running on http://127.0.0.1:${port}`);
    });
}

// ─── File loader ──────────────────────────────────────────────────────────────

/**
 * Recursively walk `directory`, calling `callback(content, filePath)` for every
 * file matching `extension`. Folders starting with "!" are skipped.
 * Also populates ADDON_DIRS for first-level subdirectories.
 *
 * Returns a Promise that resolves when all files in this directory (and its
 * subtrees) have been read — enabling callers to await full completion.
 */
function loadFilesFromDirectory(directory, extension, callback) {
    return new Promise((resolve) => {
        fs.readdir(directory, { withFileTypes: true }, (err, entries) => {
            if (err) {
                // Directory may simply not exist yet — not a fatal error
                if (err.code !== "ENOENT") {
                    console.warn(
                        `[Addons] Cannot read directory '${directory}':`,
                        err.message,
                    );
                }
                return resolve();
            }

            const pending = [];

            for (const entry of entries) {
                const fullPath = path.join(directory, entry.name);

                let stat;
                try {
                    stat = fs.statSync(fullPath); // follows symlinks
                } catch {
                    console.warn(
                        `[Addons] Broken symlink or inaccessible: ${fullPath}`,
                    );
                    continue;
                }

                if (stat.isDirectory()) {
                    // Skip explicitly disabled folders
                    if (entry.name.startsWith("!")) continue;

                    // Pre-register top-level addon dirs
                    if (
                        directory === addonsDirectory &&
                        !ADDON_DIRS.has(entry.name)
                    ) {
                        ADDON_DIRS.set(entry.name, fullPath);
                        console.log(
                            `[Assets] Pre-registered addon: ${entry.name} → ${fullPath}`,
                        );
                    }

                    // Register addon by parent dir name when we find its assets folder
                    if (entry.name === "assets") {
                        const addonName = path.basename(directory);
                        if (!ADDON_DIRS.has(addonName)) {
                            ADDON_DIRS.set(addonName, directory);
                            console.log(
                                `[Assets] Registered addon: ${addonName} → ${directory}`,
                            );
                        }
                        continue; // Don't recurse into assets/
                    }

                    pending.push(
                        loadFilesFromDirectory(fullPath, extension, callback),
                    );
                    continue;
                }

                if (stat.isFile() && path.extname(entry.name) === extension) {
                    const p = new Promise((res2) => {
                        fs.readFile(fullPath, "utf8", (readErr, content) => {
                            if (readErr) {
                                console.warn(
                                    `[Addons] Cannot read file '${fullPath}':`,
                                    readErr.message,
                                );
                            } else {
                                try {
                                    callback(content, fullPath);
                                } catch (cbErr) {
                                    console.error(
                                        `[Addons] Callback error for '${fullPath}':`,
                                        cbErr,
                                    );
                                }
                            }
                            res2();
                        });
                    });
                    pending.push(p);
                }
            }

            Promise.all(pending).then(resolve);
        });
    });
}

// ─── Online addon loader ───────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch a URL with a timeout. Returns the response text or throws.
 */
async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.text();
    } finally {
        clearTimeout(timer);
    }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Apply all addons (local + online).
 * `mainWindow` must be passed explicitly to avoid relying on a global.
 */
async function applyAddons(mainWindow) {
    if (!config.programSettings.addons.enable) {
        console.log("Addons are disabled");
        return;
    }

    if (!mainWindow) {
        console.error(
            "[Addons] mainWindow is not provided — aborting applyAddons",
        );
        return;
    }

    console.log("Loading addons…");

    // Start the asset server before scanning files
    startAssetServer();

    /**
     * Safely execute JS in the renderer. Logs errors but never throws.
     */
    async function execJS(script, label) {
        try {
            await mainWindow.webContents.executeJavaScript(script);
        } catch (err) {
            console.error(
                `[Addons] executeJavaScript failed for '${label}':`,
                err,
            );
        }
    }

    function cssInjectionScript(cssContent) {
        const escaped = cssContent.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
        return `(() => {
            const style = document.createElement('style');
            style.textContent = \`${escaped}\`;
            document.head.appendChild(style);
        })();`;
    }

    // ── Local CSS ────────────────────────────────────────────────────────────

    await loadFilesFromDirectory(
        addonsDirectory,
        ".css",
        (cssContent, filePath) => {
            const label = path.relative(addonsDirectory, filePath);
            console.log(`Load CSS: ${label}`);
            execJS(cssInjectionScript(cssContent), label);
        },
    );

    // ── Local JS ─────────────────────────────────────────────────────────────

    await loadFilesFromDirectory(
        addonsDirectory,
        ".js",
        (jsContent, filePath) => {
            const label = path.relative(addonsDirectory, filePath);
            console.log(`Load JS: ${label}`);
            execJS(jsContent, label);
        },
    );

    // ── Online addons ────────────────────────────────────────────────────────

    const onlineAddons = config.programSettings.addons.onlineScripts ?? [];

    await Promise.allSettled(
        onlineAddons.map(async (url) => {
            console.log(`Loading online addon: ${url}`);
            let content;
            try {
                content = await fetchWithTimeout(url);
            } catch (err) {
                console.error(
                    `[Addons] Failed to fetch '${url}':`,
                    err.message,
                );
                return;
            }

            if (url.endsWith(".js")) {
                await execJS(content, url);
            } else if (url.endsWith(".css")) {
                await execJS(cssInjectionScript(content), url);
            } else {
                console.warn(
                    `[Addons] Unknown file type for online addon: ${url}`,
                );
            }
        }),
    );

    console.log("Addons loaded.");
}

export { applyAddons, startAssetServer, loadFilesFromDirectory };
