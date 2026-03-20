const {
    Tray,
    Menu,
    shell,
    BrowserWindow,
    nativeImage,
    app,
    ipcMain,
} = require("electron");
const { checkForUpdates } = require("../lib/updater");
const { version: CURRENT_VERSION } = require("../../package.json");
const { trayIconPath, getPaths } = require("../config.js");
const { getConfig, setLanguage } = require("../lib/configManager.js");
const {
    initLanguages,
    loadLanguage,
    getAvailableLanguages,
    getCurrentLangCode,
    t,
} = require("../lib/langManager.js");
const { createInfoWindow } = require("./window/createInfoWindow.js");
const { createInfoV2Window } = require("./window/createInfoV2Window.js");
const config = getConfig();
const path = require("path");

let trayInstance = null;
let mainWindowRef = null;

const trayIcon = nativeImage
    .createFromPath(trayIconPath)
    .resize({ width: 24, height: 24 });

// Инициализация языка
function setupLanguage() {
    const { languagesDirectory } = getPaths();
    const config = getConfig();
    const langCode = config?.programSettings?.language || "en";
    initLanguages(languagesDirectory, langCode);
}

// Построение меню
function buildContextMenu(nextMusicDirectory, addonsDirectory, configFilePath) {
    const { languagesDirectory } = getPaths();
    const availableLanguages = getAvailableLanguages(languagesDirectory);
    const currentLangCode = getCurrentLangCode();

    const languageSubmenu = availableLanguages.map((langCode) => ({
        label: langCode,
        type: "radio",
        checked: langCode === currentLangCode,
        click: () => {
            if (langCode === getCurrentLangCode()) return;

            loadLanguage(languagesDirectory, langCode);
            setLanguage(langCode);
            rebuildTrayMenu(
                nextMusicDirectory,
                addonsDirectory,
                configFilePath,
            );

            // Отправить всем открытым окнам
            BrowserWindow.getAllWindows().forEach((win) => {
                win.webContents.send("change-language", langCode);
            });
        },
    }));

    return Menu.buildFromTemplate([
        {
            label: t("tray.appTitle", { version: CURRENT_VERSION }),
            enabled: false,
        },
        { type: "separator" },
        {
            label: t("tray.openMusicFolder"),
            click: async () => {
                if (!nextMusicDirectory) {
                    console.error("nextMusicDirectory is not defined");
                    return;
                }
                const result = await shell.openPath(
                    path.normalize(nextMusicDirectory),
                );
                if (result) console.error("Failed to open path:", result);
            },
        },
        {
            label: t("tray.openAddonsFolder"),
            click: async () => {
                if (!addonsDirectory) {
                    console.error("addonsDirectory is not defined");
                    return;
                }
                const result = await shell.openPath(
                    path.normalize(addonsDirectory),
                );
                if (result) console.error("Failed to open path:", result);
            },
        },
        {
            label: t("tray.openConfig"),
            click: async () => {
                if (!configFilePath) {
                    console.error("configFilePath is not defined");
                    return;
                }
                const result = await shell.openPath(
                    path.normalize(configFilePath),
                );
                if (result) console.error("Failed to open path:", result);
            },
        },
        { type: "separator" },
        {
            label: t("tray.downloadExtensions"),
            click: () =>
                shell.openExternal(
                    "https://github.com/Web-Next-Music/Next-Music-Extensions",
                ),
        },
        {
            label: t("tray.donate"),
            click: () => shell.openExternal("https://boosty.to/diramix"),
        },
        { type: "separator" },
        {
            label: t("tray.language"),
            submenu: languageSubmenu,
        },
        { type: "separator" },
        {
            label: t("tray.info"),
            click: () => selInfoVer(),
        },
        {
            label: t("tray.checkUpdates"),
            click: () => checkForUpdates(),
        },
        {
            label: t("tray.restart"),
            click: () => {
                app.relaunch();
                app.exit(0);
            },
        },
        {
            label: t("tray.quit"),
            click: () => {
                mainWindowRef?.removeAllListeners("close");
                app.quit();
            },
        },
    ]);
}

function rebuildTrayMenu(nextMusicDirectory, addonsDirectory, configFilePath) {
    if (!trayInstance) return;
    trayInstance.setContextMenu(
        buildContextMenu(nextMusicDirectory, addonsDirectory, configFilePath),
    );
}

// Создание трея
function createTray(
    iconPath,
    mainWindow,
    nextMusicDirectory,
    addonsDirectory,
    configFilePath,
) {
    mainWindowRef = mainWindow;

    // Инициализируем язык перед построением меню
    setupLanguage();

    trayInstance = new Tray(trayIcon);

    trayInstance.setToolTip("Next Music");
    trayInstance.setContextMenu(
        buildContextMenu(nextMusicDirectory, addonsDirectory, configFilePath),
    );

    trayInstance.on("click", () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

// info
function selInfoVer() {
    if (config?.experiments?.nm_info_v2 == false) {
        createInfoWindow();
    } else {
        createInfoV2Window();
    }
}

ipcMain.on("close-window", () => {
    const infoWindow = BrowserWindow.getFocusedWindow();
    if (infoWindow) infoWindow.close();
});

ipcMain.on("get-lang-info", (event) => {
    const { languagesDirectory } = getPaths();
    const langCode = getConfig().programSettings?.language ?? "en";
    event.returnValue = { languagesDirectory, langCode };
});

module.exports = { createTray, setupLanguage, t };
