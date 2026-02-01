const { app, BrowserWindow, session, nativeTheme } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const axios = require("axios");

// Иконка
const appIcon = path.join(__dirname, "assets/icon-256.png");

// Пути Модулей
const loaderPath = path.join(__dirname, "renderer/loader/loader.html");

// Получаем папку для хранения данных приложения
const nextMusicDirectory = path.join(app.getPath("userData"), "Next Music");
const addonsDirectory = path.join(nextMusicDirectory, "Addons");
const configFilePath = path.join(nextMusicDirectory, "config.json");

// Libs
const { createTray } = require("./tray/tray.js");
const { checkForUpdates } = require("./services/updater/updater.js");
let mainWindow;

// flags
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// Window color fix
if (process.platform === "linux") {
    app.commandLine.appendSwitch("disable-features", "WaylandWpColorManagerV1");
}

app.commandLine.appendSwitch("force-color-profile", "srgb");

// Config
let config = {
    launchSettings: {
        loaderWindow: true,
        startMinimized: false,
    },

    windowSettings: {
        alwaysOnTop: false,
        freeWindowResize: false,
        nextTitle: true,
    },

    programSettings: {
        richPresence: {
            enabled: true,
            rpcTitle: "Next Music",
        },
        addons: {
            enable: true,
            onlineScripts: [],
        },
        checkUpdates: true,
    },

    experimental: {
        volumeNormalization: false,
    },
};

if (!app.requestSingleInstanceLock()) {
    // Если есть уже запущенный экземпляр, выходим
    app.quit();
} else {
    app.on("second-instance", () => {
        // Это событие вызывается, когда кто-то пытается открыть вторую копию
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        config = loadConfig(nextMusicDirectory, config);
        if (config.programSettings.checkUpdates) {
            checkForUpdates();
        }
        mainWindow = createWindow();
        presenceService(config);
        createTray(
            appIcon,
            mainWindow,
            nextMusicDirectory,
            configFilePath,
            config,
        );
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}

function createLoaderWindow() {
    loaderWindow = new BrowserWindow({
        width: 240,
        height: 280,
        backgroundColor: "#000",
        show: true,
        resizable: false,
        fullscreenable: false,
        movable: true,
        frame: false,
        transparent: false,
        roundedCorners: true,
        icon: appIcon,
    });

    loaderWindow.loadURL(`file://${loaderPath}`);
}

function createWindow() {
    const showWindow = !config.launchSettings.startMinimized;

    // Если включен loader, создаём его перед основным окном
    if (config.launchSettings.loaderWindow && showWindow) {
        createLoaderWindow();
    }

    // Основное окно приложения
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        minWidth: config.windowSettings.freeWindowResize ? 0 : 800,
        minHeight: config.windowSettings.freeWindowResize ? 0 : 650,
        alwaysOnTop: config.windowSettings.alwaysOnTop,
        backgroundColor: nativeTheme.shouldUseDarkColors
            ? "#0D0D0D"
            : "#E6E6E6",
        icon: appIcon,
        webPreferences: {
            webSecurity: false, // для обхода CORS, но CSP всё равно надо менять
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
    });

    // Убираем CSP для обхода блокировок
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = details.responseHeaders || {};

        delete headers["content-security-policy"];
        delete headers["Content-Security-Policy"];

        callback({ responseHeaders: headers });
    });

    // Загружаем основной URL приложения
    mainWindow.loadURL("https://music.yandex.ru/");

    // Перехватываем Alt, чтобы меню не всплывало
    mainWindow.webContents.on("before-input-event", (event, input) => {
        if (input.key === "Alt") {
            event.preventDefault();
        }
    });

    // Когда страница основного окна загрузилась
    mainWindow.webContents.on("did-finish-load", () => {
        // Inject all scripts
        injector(mainWindow, config);

        // Inject addons
        if (config.programSettings.addons.enable) {
            applyAddons();
        } else {
            console.log("Addons are disabled");
        }

        // Закрываем loader окно (если оно есть)
        if (config.launchSettings.loaderWindow && loaderWindow) {
            try {
                loaderWindow.close();
                loaderWindow = null;
            } catch (err) {
                console.log("Loader window is missing");
            }
        }

        // Показываем основное окно
        if (showWindow) {
            mainWindow.show();
        }
    });

    mainWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
            if (isMainFrame) {
                mainWindow.loadFile(
                    path.join(__dirname, "renderer/fallback/fallback.html"),
                );
            }
        },
    );

    // Логика на старте: если стартуем свернутым
    if (config.launchSettings.startMinimized) {
        mainWindow.hide();
    } else if (!config.launchSettings.loaderWindow) {
        mainWindow.show();
    }

    // При закрытии окна — просто скрываем
    mainWindow.on("close", (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    return mainWindow;
}

function normalizeConfig(defaultConfig, savedConfig) {
    let changed = false;

    function walk(defaultVal, savedVal) {
        if (
            typeof defaultVal === "object" &&
            defaultVal !== null &&
            !Array.isArray(defaultVal)
        ) {
            if (
                typeof savedVal !== "object" ||
                savedVal === null ||
                Array.isArray(savedVal)
            ) {
                changed = true;
                return structuredClone(defaultVal);
            }

            const result = {};
            for (const key of Object.keys(defaultVal)) {
                if (!(key in savedVal)) {
                    changed = true;
                    result[key] = structuredClone(defaultVal[key]);
                } else {
                    result[key] = walk(defaultVal[key], savedVal[key]);
                }
            }
            return result;
        }

        // массив
        if (Array.isArray(defaultVal)) {
            if (!Array.isArray(savedVal)) {
                changed = true;
                return structuredClone(defaultVal);
            }
            return savedVal;
        }

        // примитивы
        if (typeof savedVal !== typeof defaultVal) {
            changed = true;
            return defaultVal;
        }

        return savedVal;
    }

    const normalized = walk(defaultConfig, savedConfig);
    return { config: normalized, changed };
}

// Load config
function loadConfig(nextMusicDirectory, defaultConfig) {
    if (!fs.existsSync(nextMusicDirectory)) {
        fs.mkdirSync(nextMusicDirectory, { recursive: true });
        console.log("📁 Folder created:", nextMusicDirectory);
    }

    if (!fs.existsSync(addonsDirectory)) {
        fs.mkdirSync(addonsDirectory, { recursive: true });
        console.log("📁 Folder created:", addonsDirectory);
    }

    let config;

    if (!fs.existsSync(configFilePath)) {
        config = structuredClone(defaultConfig);
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(config, null, 2),
            "utf-8",
        );
        console.log("⚙️ config.json created");
    } else {
        try {
            const raw = fs.readFileSync(configFilePath, "utf-8");
            const savedConfig = JSON.parse(raw);

            const { config: normalizedConfig, changed } = normalizeConfig(
                defaultConfig,
                savedConfig,
            );

            config = normalizedConfig;

            if (changed) {
                fs.writeFileSync(
                    configFilePath,
                    JSON.stringify(config, null, 2),
                    "utf-8",
                );
                console.log(
                    "⚙️ config.json fixed (invalid or missing options)",
                );
            } else {
                console.log("⚙️ Config loaded successfully");
            }
        } catch (err) {
            console.error(
                "❌ Error reading config.json, reset to default",
                err,
            );
            config = structuredClone(defaultConfig);
            fs.writeFileSync(
                configFilePath,
                JSON.stringify(config, null, 2),
                "utf-8",
            );
        }
    }

    module.exports = config;

    return config;
}

// Injector
const injectList = [
    {
        file: "nextTitle.js",
        condition: (config) => config?.windowSettings?.nextTitle,
    },
    {
        file: "siteRPCServer.js",
        condition: (config) => config?.programSettings?.richPresence?.enabled,
    },
    {
        file: "volumeNormalization.js",
        condition: (config) => config?.experimental?.volumeNormalization,
    },
];

function injector(mainWindow, config) {
    try {
        const injectDir = path.join(__dirname, "inject");

        for (const item of injectList) {
            const { file, condition } = item;

            // если есть условие и оно false — пропускаем
            if (typeof condition === "function" && !condition(config)) {
                console.log("[Injector] ⏭ Skipped by config:", file);
                continue;
            }

            const fullPath = path.join(injectDir, file).replace(/\\/g, "/");

            if (!fs.existsSync(fullPath)) {
                console.warn("[Injector] ⚠️ File not found:", file);
                continue;
            }

            const injectScript = `
                (() => {
                    const injectedPath = "${fullPath}";
                    if (!document.querySelector('script[data-injected="' + injectedPath + '"]')) {
                        const s = document.createElement("script");
                        s.src = "file://" + injectedPath;
                        s.type = "text/javascript";
                        s.defer = true;
                        s.dataset.injected = injectedPath;
                        document.head.appendChild(s);
                    }
                })();
            `;

            mainWindow.webContents
                .executeJavaScript(injectScript)
                .then(() => {
                    console.log("[Injector] ✅ Injected:", file);
                })
                .catch((err) => {
                    console.error("[Injector] ❌ Failed to inject:", file, err);
                });
        }
    } catch (err) {
        console.error("[Injector] ❌ Injector error:", err);
    }
}

// Addons
function applyAddons() {
    if (!config.programSettings.addons.enable) {
        console.log("Addons are disabled");
        return;
    }

    console.log("Loading addons:");

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

// Поднимаем сервер один раз
const ASSETS = [];
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

            name = decodeURIComponent(name.replace(/\+/g, " "));

            const assetsRoot = path.join(addonsDirectory, name, "assets");

            if (!fs.existsSync(assetsRoot)) {
                res.writeHead(404);
                return res.end("Assets folder not found");
            }

            // Рекурсивный поиск файла в assets
            function findFileRecursive(dir) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isFile() && entry.name === fileName)
                        return fullPath;
                    if (entry.isDirectory()) {
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

            // декодируем имя
            name = decodeURIComponent(name.replace(/\+/g, " "));

            // путь к handleEvents.json в папке родителя
            const handleFile = path.join(
                addonsDirectory,
                name,
                "handleEvents.json",
            );

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
        if (pathname === "/get_handle") {
            if (!name) {
                res.writeHead(400);
                return res.end("Missing name");
            }

            // декодируем имя
            name = decodeURIComponent(name.replace(/\+/g, " "));

            // путь к handleEvents.json в папке родителя
            const handleFile = path.join(
                addonsDirectory,
                name,
                "handleEvents.json",
            );

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

// Рекурсивный обход директорий
function loadFilesFromDirectory(directory, extension, callback) {
    fs.readdir(directory, { withFileTypes: true }, (err, entries) => {
        if (err) return;

        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);

            // нашли assets
            if (entry.isDirectory() && entry.name === "assets") {
                ASSETS.push({
                    path: fullPath,
                    parent: path.basename(directory),
                });

                startAssetServer();
                continue;
            }

            // пропускаем !папки
            if (entry.isDirectory()) {
                if (!entry.name.startsWith("!")) {
                    loadFilesFromDirectory(fullPath, extension, callback);
                }
                continue;
            }

            // обычные файлы
            if (path.extname(entry.name) === extension) {
                fs.readFile(fullPath, "utf8", (err, content) => {
                    if (!err) callback(content, fullPath);
                });
            }
        }
    });
}

// Initialize Discord RPC
function presenceService(config) {
    if (!config?.programSettings?.richPresence?.enabled) {
        console.log("[RPC] ⚠️ Discord RPC is disabled or config not ready");
        return;
    }

    try {
        const { initRPC } = require("./services/discordRpc/richPresence.js");
        initRPC();

        console.log("[RPC] ✅ Discord RPC initialized");
    } catch (err) {
        console.error("[RPC] ❌ Failed to initialize Discord RPC:", err);
    }
}
