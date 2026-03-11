const { loadConfig, getPaths } = require("../config");
const { addonsDirectory } = getPaths();
const fs = require("fs");
const path = require("path");
const http = require("http");

const config = loadConfig();

// Addons
function applyAddons() {
    if (!config.programSettings.addons.enable) {
        console.log("Addons are disabled");
        return;
    }

    console.log("Loading addons:");

    // Запускаем сервер ассетов один раз перед загрузкой аддонов
    startAssetServer();

    // --- Local CSS ---
    loadFilesFromDirectory(addonsDirectory, ".css", (cssContent, filePath) => {
        console.log(`Load CSS: ${path.relative(addonsDirectory, filePath)}`);
        const script = `(() => {
                const style = document.createElement('style');
                style.textContent = \`${cssContent.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\`;
                document.head.appendChild(style);
            })();`;
        mainWindow.webContents.executeJavaScript(script).catch(console.error);
    });

    // --- Local JS ---
    loadFilesFromDirectory(addonsDirectory, ".js", (jsContent, filePath) => {
        console.log(`Load JS: ${path.relative(addonsDirectory, filePath)}`);
        mainWindow.webContents
            .executeJavaScript(jsContent)
            .catch(console.error);
    });

    // --- Online addons (JS and CSS separately) ---
    const onlineAddons = config.programSettings.addons.onlineScripts;
    onlineAddons.forEach((url) => {
        console.log(`Loading online addon: ${url}`);

        fetch(url)
            .then((res) => res.text())
            .then((content) => {
                if (url.endsWith(".js")) {
                    // Execute as JS
                    mainWindow.webContents
                        .executeJavaScript(content)
                        .catch((err) => {
                            console.error(
                                `Error executing online JS from ${url}:`,
                                err,
                            );
                        });
                } else if (url.endsWith(".css")) {
                    // Inject as style
                    const script = `(() => {
                        const style = document.createElement('style');
                        style.textContent = \`${content.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\`;
                        document.head.appendChild(style);
                    })();`;
                    mainWindow.webContents
                        .executeJavaScript(script)
                        .catch((err) => {
                            console.error(
                                `Error injecting online CSS from ${url}:`,
                                err,
                            );
                        });
                } else {
                    console.warn(`Unknown file type for online addon: ${url}`);
                }
            })
            .catch((err) => {
                console.error(`Failed to load online addon from ${url}:`, err);
            });
    });
}

// Setup assets server
// Маппинг: имя аддона (папки) → абсолютный путь к папке аддона
const ADDON_DIRS = new Map();
let serverStarted = false;

function startAssetServer() {
    if (serverStarted) return;
    serverStarted = true;

    http.createServer((req, res) => {
        let parsed;

        try {
            parsed = new URL(req.url, "http://127.0.0.1:2007");
        } catch {
            res.writeHead(400);
            return res.end("Bad URL");
        }

        const pathname = parsed.pathname;

        // декодируем name максимально терпимо
        let name = parsed.searchParams.get("name");
        if (name) {
            name = decodeURIComponent(name.replace(/\+/g, " "));
        }

        // /assets/...
        if (pathname.startsWith("/assets/")) {
            const fileName = decodeURIComponent(
                pathname.slice("/assets/".length),
            );

            if (!name) {
                res.writeHead(400);
                return res.end("Missing name");
            }

            // Ищем реальный путь к папке аддона по имени
            const addonDir = ADDON_DIRS.get(name);
            if (!addonDir) {
                res.writeHead(404);
                return res.end("Addon not found");
            }

            const assetsRoot = path.join(addonDir, "assets");

            if (!fs.existsSync(assetsRoot)) {
                res.writeHead(404);
                return res.end("Assets folder not found");
            }

            // Рекурсивный поиск файла в assets (с поддержкой симлинков)
            function findFileRecursive(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);

                    // Разрешаем симлинки через stat (следует по ссылке)
                    let stat;
                    try {
                        stat = fs.statSync(fullPath);
                    } catch {
                        continue; // битая ссылка — пропускаем
                    }

                    if (stat.isFile() && entry.name === fileName)
                        return fullPath;
                    if (stat.isDirectory()) {
                        const found = findFileRecursive(fullPath);
                        if (found) return found;
                    }
                }
                return null;
            }

            const filePath = findFileRecursive(assetsRoot);

            if (!filePath) {
                res.writeHead(404);
                return res.end("File not found in assets");
            }

            res.writeHead(200);
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // /get_handle
        if (pathname === "/get_handle") {
            if (!name) {
                res.writeHead(400);
                return res.end("Missing name");
            }

            // Ищем реальный путь к папке аддона по имени
            const addonDir = ADDON_DIRS.get(name);
            if (!addonDir) {
                res.writeHead(404);
                return res.end("Addon not found");
            }

            const handleFile = path.join(addonDir, "handleEvents.json");

            if (!fs.existsSync(handleFile)) {
                console.error("[get_handle] File not found:", handleFile);
                res.writeHead(404);
                return res.end("handleEvents.json not found");
            }

            // читаем файл и сразу оборачиваем в { data: ... }
            fs.readFile(handleFile, "utf8", (err, fileContent) => {
                if (err) {
                    res.writeHead(500);
                    return res.end("Server error");
                }

                try {
                    const parsed = JSON.parse(fileContent); // проверяем JSON
                    const wrapped = { data: parsed }; // оборачиваем
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(wrapped));
                } catch (e) {
                    console.error("[get_handle] Invalid JSON:", e);
                    res.writeHead(500);
                    res.end("Invalid JSON in handleEvents.json");
                }
            });

            return;
        }

        // fallback
        res.writeHead(404);
        res.end("Not found");
    }).listen(2007, "127.0.0.1", () => {
        console.log("[Assets] Server running on http://127.0.0.1:2007");
    });
}

// Рекурсивный обход директорий (с поддержкой символических ссылок)
function loadFilesFromDirectory(directory, extension, callback) {
    fs.readdir(directory, { withFileTypes: true }, (err, entries) => {
        if (err) return;

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            // Определяем реальный тип записи — следуем по симлинкам через stat
            let stat;
            try {
                stat = fs.statSync(fullPath); // в отличие от lstat — раскрывает симлинк
            } catch {
                console.warn(
                    `[Addons] Broken symlink or inaccessible: ${fullPath}`,
                );
                continue;
            }

            const isDirectory = stat.isDirectory();
            const isFile = stat.isFile();

            if (isDirectory) {
                if (!entry.name.startsWith("!")) {
                    // Регистрируем папку аддона при входе в неё (независимо от наличия assets)
                    if (!ADDON_DIRS.has(entry.name)) {
                        ADDON_DIRS.set(entry.name, fullPath);
                        console.log(
                            `[Assets] Registered addon: ${entry.name} → ${fullPath}`,
                        );
                    }
                    loadFilesFromDirectory(fullPath, extension, callback);
                }
                continue;
            }

            // обычные файлы (в т.ч. симлинки на файлы)
            if (isFile && path.extname(entry.name) === extension) {
                fs.readFile(fullPath, "utf8", (err, content) => {
                    if (!err) callback(content, fullPath);
                });
            }
        }
    });
}

module.exports = { applyAddons, startAssetServer, loadFilesFromDirectory };
