const { app, BrowserWindow, protocol } = require("electron");

// Config
const { loadConfig } = require("./config");
const { appIcon, getPaths } = require("./config.js");
const { nextMusicDirectory, addonsDirectory, configFilePath } = getPaths();

// Services
const { createTray } = require("./lib/tray.js");
const { checkForUpdates } = require("./lib/updater.js");
const { presenceService } = require("./lib/richPresence.js");
const { createWindow } = require("./lib/window/mainWindow/createWindow.js");
const { setupSplashScreen } = require("./lib/splashScreen.js");
const {
    setupStorePage,
    injectStoreHtml,
} = require("./lib/storePage/storePage.js");
const obsWidgetService = require("./lib/obsWidget/obsWidget.js");

// IPC
const setupIpcEvents = require("./events");

// Flags & Fixes
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

// Fix color rendering on Linux (Wayland issue)
if (process.platform === "linux") {
    app.commandLine.appendSwitch("disable-features", "WaylandWpColorManagerV1");
}

// Normalize color profile across platforms
app.commandLine.appendSwitch("force-color-profile", "srgb");

// Register nextstore:// as a privileged scheme before app is ready
protocol.registerSchemesAsPrivileged([
    {
        scheme: "nextstore",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);

// Allow self-signed/spoofed certificates
app.on(
    "certificate-error",
    (event, _webContents, _url, _error, _cert, callback) => {
        event.preventDefault();
        callback(true);
    },
);

// Single Instance Lock
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
    app.quit();
    return;
}

// When a second instance is launched, focus the existing window instead
app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
});

// Window Lifecycle
let mainWindow;

// Quit app when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

// Re-create window on dock/taskbar click if no windows exist
app.on("activate", () => {
    const hasNoWindows = BrowserWindow.getAllWindows().length === 0;
    if (hasNoWindows) {
        mainWindow = createWindow();
    }
});

// App Initialization
app.whenReady().then(() => {
    const config = loadConfig();
    mainWindow = createWindow(config);

    const listenAlong = config?.experimental?.listenAlong;
    let targetUrl = "https://music.yandex.ru/";

    if (listenAlong?.enable) {
        const params = new URLSearchParams({
            __blackIsland: listenAlong.blackIsland || null,
            __wss: listenAlong.host
                ? `${listenAlong.host}:${listenAlong.port || null}`
                : "",
            __room: listenAlong.roomId || "",
            __clientId: listenAlong.clientId || "",
            __avatarUrl: listenAlong.avatarUrl || "",
        });
        targetUrl = "https://music.yandex.ru/?" + params.toString();
    }

    if (
        config.launchSettings?.splashScreen &&
        !config.launchSettings?.startMinimized &&
        !config.launchSettings?.loaderWindow
    ) {
        setupSplashScreen(mainWindow, targetUrl);
    } else {
        mainWindow.loadURL(targetUrl);
    }

    if (config.programSettings?.addons?.enable) {
        setupStorePage();
        mainWindow.webContents.on("did-finish-load", () =>
            injectStoreHtml(mainWindow),
        );
    }

    setupIpcEvents(mainWindow);

    createTray(
        appIcon,
        mainWindow,
        nextMusicDirectory,
        addonsDirectory,
        configFilePath,
        config,
    );

    if (config.programSettings?.checkUpdates) {
        checkForUpdates();
    }

    if (config?.programSettings?.obsWidget) {
        obsWidgetService.startServer({ port: 4091 });
    }

    if (config?.programSettings?.richPresence?.enabled) {
        presenceService(config);
    }
});
