import { BrowserWindow, ipcMain, shell, app } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import { getCurrentVersion } from "../../getAppVersion.js";
import { getConfig, updateConfig } from "../../configManager.js";
import { getPaths } from "../../../config.js";

import {
    loadLanguage,
    getAvailableLanguages,
    getAllStrings,
} from "../../langManager.js";

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import pkg from "../../../../package.json" with { type: "json" };

let settingsWindow = null;
let _rebuildTray = null;

export function setTrayRebuilder(fn) {
    _rebuildTray = fn;
}

// Window factory
export function createSettingsWindow() {
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
            preload: path.join(__dirname, "preload.cjs"),
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

// ============================
// IPC (guard against duplicates)
// ============================
if (!ipcMain.listenerCount("settings:get-versions")) {
    ipcMain.handle("settings:get-versions", () => {
        return {
            app: getCurrentVersion(),
            electron: process.versions.electron,
            chromium: process.versions.chrome,
            node: process.versions.node,
        };
    });
}

if (!ipcMain.listenerCount("settings:load-config")) {
    ipcMain.handle("settings:load-config", () => getConfig());
}

if (!ipcMain.listenerCount("settings:save-config")) {
    ipcMain.handle("settings:save-config", (_event, newConfig) => {
        updateConfig(newConfig);
    });
}

// ============================
// WINDOW CONTROL
// ============================
ipcMain.on("settings:toggle-maximize", () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;

    if (settingsWindow.isMaximized()) {
        settingsWindow.unmaximize();
    } else {
        settingsWindow.maximize();
    }
});

ipcMain.on("settings:minimize", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.minimize();
    }
});

ipcMain.on("settings:close", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.close();
    }
});

// ============================
// SYSTEM
// ============================
ipcMain.on("settings:open-addons-folder", () => {
    const { addonsDirectory } = getPaths();
    shell.openPath(addonsDirectory);
});

ipcMain.on("settings:restart-app", () => {
    app.relaunch();
    app.exit(0);
});

// ============================
// I18N
// ============================
ipcMain.handle("settings:load-lang-strings", () => {
    return getAllStrings?.() ?? {};
});

ipcMain.handle("settings:get-lang-list", () => {
    const { languagesDirectory } = getPaths();
    return getAvailableLanguages(languagesDirectory);
});

ipcMain.on("settings:set-language", (_event, langCode) => {
    const { languagesDirectory } = getPaths();

    loadLanguage(languagesDirectory, langCode);

    const cfg = getConfig();
    cfg.programSettings.language = langCode;
    updateConfig(cfg);

    _rebuildTray?.();

    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send(
            "settings:language-changed",
            getAllStrings?.() ?? {},
        );
    }

    BrowserWindow.getAllWindows().forEach((win) => {
        if (win !== settingsWindow) {
            win.webContents.send("change-language", langCode);
        }
    });
});
