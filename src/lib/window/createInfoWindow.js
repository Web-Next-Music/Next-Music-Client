const { BrowserWindow, ipcMain } = require("electron");
const { trayIconPath } = require("../../config.js");
const { nativeImage } = require("electron");
const path = require("path");

const trayIcon = nativeImage
    .createFromPath(trayIconPath)
    .resize({ width: 24, height: 24 });

let infoWindow = null;

function createInfoWindow() {
    if (infoWindow) {
        infoWindow.focus();
        return;
    }

    infoWindow = new BrowserWindow({
        width: 585,
        height: 360,
        useContentSize: true,
        resizable: false,
        autoHideMenuBar: true,
        alwaysOnTop: true,
        backgroundColor: "#030117",
        icon: trayIcon,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    infoWindow.loadFile(path.join(__dirname, "../../renderer/info/info.html"));
    infoWindow.setMenu(null);

    infoWindow.on("closed", () => {
        infoWindow = null;
    });
}

module.exports = { createInfoWindow };
