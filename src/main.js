const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { version: CURRENT_VERSION } = require("../package.json");

// Иконка
const appIcon = path.join(__dirname, "app/icons/icon-256.png");

// Пути Модулей
const loaderPath = path.join(__dirname, "app/loader/loader.html");

// Получаем папку для хранения данных приложения
const nextMusicDirectory = path.join(app.getPath("userData"), "Next Music");
const addonsDirectory = path.join(nextMusicDirectory, "Addons");
const configFilePath = path.join(nextMusicDirectory, "config.json");

// Libs
const { createTray } = require("./app/tray/tray.js");
const { checkForUpdates } = require("./app/updater/updater.js");
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
    windowSettings: {
        alwaysOnTop: false,
        freeWindowResize: false,
    },

    programSettings: {
        richPresence: {
            enabled: true,
            rpcTitle: "Next Music",
        },
        addonsEnabled: true,
        checkUpdates: true,
    },

    launchSettings: {
        loaderWindow: true,
        startMinimized: false,
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
        backgroundColor: "#0D0D0D",
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
        // Закрываем loader окно (если оно есть)
        if (config.launchSettings.loaderWindow && loaderWindow) {
            try {
                loaderWindow.close();
                loaderWindow = null;
            } catch (err) {
                console.log("Loader window is missing");
            }
        }

        // Загружаем аддоны
        if (config.programSettings.addonsEnabled) {
            applyAddons();
        } else {
            console.log("Addons are disabled");
        }

        activateRpc();

        // Показываем основное окно
        if (showWindow) {
            mainWindow.show();
        }
    });

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
        // если дефолт — объект
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

function applyAddons() {
    if (config.programSettings.addonsEnabled) {
        console.log("Loading addons:");
        loadFilesFromDirectory(
            addonsDirectory,
            ".css",
            (cssContent, filePath) => {
                console.log(
                    `Load CSS: ${path.relative(addonsDirectory, filePath)}`,
                );
                const script = `(() => {
                const style = document.createElement('style');
                style.textContent = \`${cssContent.replace(/\\/g, "\\\\").replace(/`/g, "\`")}\`;
                document.body.appendChild(style);
            })();`;
                mainWindow.webContents
                    .executeJavaScript(script)
                    .catch((err) => {
                        console.error("Error inserting CSS:", err);
                    });
            },
        );
        loadFilesFromDirectory(
            addonsDirectory,
            ".js",
            (jsContent, filePath) => {
                console.log(
                    `Load JS: ${path.relative(addonsDirectory, filePath)}`,
                );
                mainWindow.webContents
                    .executeJavaScript(jsContent)
                    .catch((err) => {
                        console.error("Error executing JS:", err);
                    });
            },
        );
    } else {
        console.log("Addons are disabled");
    }
}

function loadFilesFromDirectory(directory, extension, callback) {
    fs.readdir(directory, (err, files) => {
        if (err) {
            console.error("Error reading directory:", err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(directory, file);

            fs.stat(filePath, (err, stat) => {
                if (err) {
                    console.error("Error stating file:", err);
                    return;
                }

                if (stat.isDirectory()) {
                    // Пропускаем папки, начинающиеся с "!"
                    if (!file.startsWith("!")) {
                        loadFilesFromDirectory(filePath, extension, callback);
                    }
                } else if (path.extname(file) === extension) {
                    fs.readFile(filePath, "utf8", (err, content) => {
                        if (err) {
                            console.error(`Error reading ${file}:`, err);
                            return;
                        }
                        callback(content, filePath);
                    });
                }
            });
        });
    });
}

// Initialize Discord RPC and inject siteServer.js only if enabled
function activateRpc() {
    if (config.programSettings.richPresence.enabled) {
        try {
            const { initRPC } = require("./app/discordRpc/richPresence.js");

            initRPC();

            // Inject siteServer.js
            const loaderPath = path.join(
                __dirname,
                "app/discordRpc/siteServer.js",
            );
            const normalizedPath = loaderPath.replace(/\\/g, "/");

            const injectScript = `
          (() => {
            if (!document.querySelector('script[data-injected="${normalizedPath}"]')) {
              const s = document.createElement('script');
              s.src = "file://${normalizedPath}";
              s.type = "text/javascript";
              s.defer = true;
              s.dataset.injected = "${normalizedPath}";
              document.head.appendChild(s);
            }
          })();
        `;

            mainWindow.webContents
                .executeJavaScript(injectScript)
                .then(() => console.log("[RPC] ✅ siteServer.js injected"))
                .catch(console.error);
        } catch (err) {
            console.error("[RPC] ❌ Failed to initialize Discord RPC:", err);
        }
    } else {
        console.log("[RPC] ⚠️ Discord RPC is disabled");
    }
}
