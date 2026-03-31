import { BrowserWindow, nativeImage, ipcMain } from "electron";
import { getCurrentVersionWV } from "../../lib/getAppVersion.js";
import { trayIconPath, getPaths } from "../../config.js";
import { getConfig } from "../../lib/configManager.js";
import path from "path";

// __dirname fix for ESM
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!ipcMain.listenerCount("get-app-version")) {
    ipcMain.on("get-app-version", (event) => {
        event.returnValue = getCurrentVersionWV();
    });
}

const trayIcon = nativeImage
    .createFromPath(trayIconPath)
    .resize({ width: 24, height: 24 });

let infoWindow = null;

export function createInfoV2Window() {
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
