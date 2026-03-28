import { app, BrowserWindow, session, nativeTheme } from "electron";
import { createLoaderWindow } from "../createLoaderWindow.js";
import { applyAddons } from "../../loadAddons.js";
import { appIcon } from "../../../config.js";
import injector from "../../injector.js";
import path from "path";
import fs from "fs";

// Version
import pkg from "../../../../package.json" with { type: "json" };
const CURRENT_VERSION = pkg.version;

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const titlebarFolder = path.resolve(__dirname, "..", "..", "titlebar");
const apiFile = path.resolve(__dirname, "..", "..", "api.js");

let mainWindow;

export function createWindow(config) {
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
        minWidth: config.windowSettings.freeWindowResize ? 1 : 800,
        minHeight: config.windowSettings.freeWindowResize ? 1 : 650,
        alwaysOnTop: config.windowSettings.alwaysOnTop,
        backgroundColor: nativeTheme.shouldUseDarkColors
            ? "#0D0D0D"
            : "#E6E6E6",
        icon: appIcon,
        frame: !titleBarEnabled,
        roundedCorners: true,
        show: false,
        webPreferences: {
            webSecurity: false,
            nodeIntegration: false,
            contextIsolation: true,
            preload: titleBarEnabled
                ? path.join(__dirname, "preload.cjs")
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

            injector(mainWindow, config);

            if (config.programSettings.addons.enable) {
                applyAddons(mainWindow);
            } else {
                console.log("Addons are disabled");
            }

            onFinishLoad();
        });

        mainWindow.webContents.on("did-fail-load", onFailLoad);
    }

    function onFinishLoad() {
        if (titleBarEnabled) injectTitleBar();
        injectApi();
        closeLoaderWindow();

        if (!startMinimized) mainWindow.show();
    }

    function injectApi() {
        const js = fs.readFileSync(apiFile, "utf-8");
        mainWindow.webContents.executeJavaScript(js).catch(console.error);
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
            version: CURRENT_VERSION,
        };

        mainWindow.webContents
            .executeJavaScript(
                `window.__nmcTitleBarConfig = ${JSON.stringify(
                    titleBarConfig,
                )};`,
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

    function onFailLoad(
        event,
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
    ) {
        if (isMainFrame) {
            mainWindow.loadFile(
                path.join(
                    __dirname,
                    "../../../renderer/fallback/fallback.html",
                ),
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
