const { BrowserWindow } = require("electron");
const { trayIconPath, getPaths } = require("../../config.js");
const { getConfig } = require("../../lib/configManager.js");
const { nativeImage } = require("electron");
const path = require("path");

const trayIcon = nativeImage
    .createFromPath(trayIconPath)
    .resize({ width: 24, height: 24 });

let infoWindow = null;

function createInfoV2Window() {
    if (infoWindow) {
        infoWindow.focus();
        return;
    }

    infoWindow = new BrowserWindow({
        width: 585,
        height: 400,
        useContentSize: true,
        resizable: false,
        autoHideMenuBar: true,
        alwaysOnTop: true,
        backgroundColor: "#010409",
        icon: trayIcon,
        frame: false,
        roundedCorners: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    infoWindow.loadFile(
        path.join(__dirname, "../../renderer/info_v2/index.html"),
    );
    infoWindow.setMenu(null);

    // Отправляем пути ПОСЛЕ загрузки страницы
    infoWindow.webContents.on("did-finish-load", () => {
        const { languagesDirectory } = getPaths();
        const langCode = getConfig().programSettings?.language ?? "en";
        infoWindow.webContents.send("init-lang", {
            languagesDirectory,
            langCode,
        });
    });

    infoWindow.on("closed", () => {
        infoWindow = null;
    });
}

module.exports = { createInfoV2Window };
