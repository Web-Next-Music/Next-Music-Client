const { BrowserWindow, ipcMain, shell, app } = require("electron");
const path = require("path");
const { getConfig, updateConfig } = require("../../configManager.js");
const { getPaths } = require("../../../config.js");
const {
    loadLanguage,
    getAvailableLanguages,
    getAllStrings,
} = require("../../langManager.js");

let settingsWindow = null;

let _rebuildTray = null;

function setTrayRebuilder(fn) {
    _rebuildTray = fn;
}

// Window factory

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 810,
        height: 545,
        minWidth: 560,
        minHeight: 440,
        frame: false,
        transparent: false,
        resizable: true,
        show: false,
        center: true,
        roundedCorners: true,
        backgroundColor: "#0d1117",
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    settingsWindow.loadFile(
        path.join(__dirname, "../../../renderer/settings/index.html"),
    );

    settingsWindow.once("ready-to-show", () => settingsWindow.show());

    settingsWindow.on("maximize", () =>
        settingsWindow.webContents.send("settings:maximize-changed", true),
    );
    settingsWindow.on("unmaximize", () =>
        settingsWindow.webContents.send("settings:maximize-changed", false),
    );

    settingsWindow.on("closed", () => {
        settingsWindow = null;
    });
}

// IPC: config

ipcMain.handle("settings:get-versions", () => {
    const { version: app } = require("../../../../package.json");
    return {
        app,
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
    };
});

ipcMain.handle("settings:load-config", () => getConfig());

ipcMain.handle("settings:save-config", (_event, newConfig) => {
    updateConfig(newConfig);
});

ipcMain.on("settings:toggle-maximize", () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    if (settingsWindow.isMaximized()) {
        settingsWindow.unmaximize();
    } else {
        settingsWindow.maximize();
    }
});

ipcMain.on("settings:minimize", () => {
    if (settingsWindow && !settingsWindow.isDestroyed())
        settingsWindow.minimize();
});

ipcMain.on("settings:close", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

ipcMain.on("settings:open-addons-folder", () => {
    const { addonsDirectory } = getPaths();
    shell.openPath(addonsDirectory);
});

ipcMain.on("settings:restart-app", () => {
    app.relaunch();
    app.exit(0);
});

// IPC: i18n

ipcMain.handle("settings:load-lang-strings", () => {
    return getAllStrings?.() ?? {};
});

ipcMain.handle("settings:get-lang-list", () => {
    const { languagesDirectory } = getPaths();
    return getAvailableLanguages(languagesDirectory);
});

ipcMain.on("settings:set-language", (_event, langCode) => {
    const { languagesDirectory } = getPaths();

    // 1. Загрузить новую локаль в langManager
    loadLanguage(languagesDirectory, langCode);

    // 2. Сохранить в конфиг
    const cfg = getConfig();
    cfg.programSettings.language = langCode;
    updateConfig(cfg);

    // 3. Перестроить меню трея с новыми строками
    _rebuildTray?.();

    // 4. Отправить новые строки обратно в окно настроек (обновит лейблы)
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send(
            "settings:language-changed",
            getAllStrings?.() ?? {},
        );
    }

    // 5. Уведомить все остальные окна (renderer) о смене языка
    BrowserWindow.getAllWindows().forEach((win) => {
        if (win !== settingsWindow) {
            win.webContents.send("change-language", langCode);
        }
    });
});

module.exports = { createSettingsWindow, setTrayRebuilder };
