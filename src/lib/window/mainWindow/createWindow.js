const { app, BrowserWindow, session, nativeTheme } = require("electron");
const { createLoaderWindow } = require("../createLoaderWindow.js");
const { applyAddons } = require("../../loadAddons.js");
let { appIcon } = require("../../../config.js");
const injector = require("../../injector.js");
const path = require("path");
const fs = require("fs");

const titlebarFolder = path.resolve(__dirname, "..", "..", "titlebar");

function createWindow(config) {
    const startMinimized = config?.launchSettings?.startMinimized;
    const titleBarEnabled = config.windowSettings?.titleBar?.enable;

    let loaderWindow;
    if (config.launchSettings.loaderWindow && !startMinimized) {
        loaderWindow = createLoaderWindow();
    }

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
        frame: !titleBarEnabled,
        roundedCorners: true,
        show: false,
        webPreferences: {
            webSecurity: false, // Bypass CORS (CSP is also stripped below)
            nodeIntegration: false,
            contextIsolation: true,
            preload: titleBarEnabled
                ? path.join(__dirname, "preload.js")
                : undefined,
        },
    });

    setupCSP();
    setupTitleBarEvents();
    setupInputHandlers();
    setupLoadHandlers();
    setupInitialVisibility();

    mainWindow.on("close", (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    return mainWindow;
    // Remove CSP headers to avoid content blocking
    function setupCSP() {
        session.defaultSession.webRequest.onHeadersReceived(
            (details, callback) => {
                const headers = details.responseHeaders || {};
                delete headers["content-security-policy"];
                delete headers["Content-Security-Policy"];
                callback({ responseHeaders: headers });
            },
        );
    }

    // Notify renderer on window maximize/unmaximize
    function setupTitleBarEvents() {
        if (!titleBarEnabled) return;
        mainWindow.on("maximize", () =>
            mainWindow.webContents.send("nmc-maximized"),
        );
        mainWindow.on("unmaximize", () =>
            mainWindow.webContents.send("nmc-unmaximized"),
        );
    }

    function setupInputHandlers() {
        mainWindow.webContents.on("before-input-event", (event, input) => {
            if (input.key === "Alt") event.preventDefault();
        });
    }

    function setupLoadHandlers() {
        mainWindow.webContents.on("did-finish-load", () => {
            const url = mainWindow.webContents.getURL();
            if (!url.includes("music.yandex.ru")) return;
            onFinishLoad();
        });
        mainWindow.webContents.on("did-fail-load", onFailLoad);
    }

    function onFinishLoad() {
        if (titleBarEnabled) injectTitleBar();
        injector(mainWindow, config);
        if (config.programSettings.addons.enable) {
            applyAddons(config);
        } else {
            console.log("Addons are disabled");
        }
        closeLoaderWindow();
        if (!startMinimized) mainWindow.show();
    }

    function injectTitleBar() {
        const css = fs.readFileSync(
            path.join(titlebarFolder, "titlebar.css"),
            "utf-8",
        );
        const js = fs.readFileSync(
            path.join(titlebarFolder, "titlebar.js"),
            "utf-8",
        );
        const titleBarConfig = {
            showNextText: config.windowSettings?.titleBar?.nextText === true,
            version: app.getVersion(),
        };
        mainWindow.webContents
            .executeJavaScript(
                `window.__nmcTitleBarConfig = ${JSON.stringify(titleBarConfig)};`,
            )
            .catch(console.error);
        mainWindow.webContents.insertCSS(css).catch(console.error);
        mainWindow.webContents.executeJavaScript(js).catch(console.error);
    }

    function closeLoaderWindow() {
        if (!config.launchSettings.loaderWindow || !loaderWindow) return;
        try {
            loaderWindow.close();
            loaderWindow = null;
        } catch {
            console.log("Loader window is missing");
        }
    }

    // Load fallback page if the main frame fails to load
    function onFailLoad(
        event,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
    ) {
        if (isMainFrame) {
            mainWindow.loadFile(
                path.join(__dirname, "renderer/fallback/fallback.html"),
            );
        }
    }

    function setupInitialVisibility() {
        if (config.launchSettings.startMinimized) {
            mainWindow.hide();
        } else if (!config.launchSettings.loaderWindow) {
            mainWindow.show();
        }
    }
}

module.exports = { createWindow };
