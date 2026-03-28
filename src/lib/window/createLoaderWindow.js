import { BrowserWindow } from "electron";
import { appIcon } from "../../config.js";
import path from "path";

// __dirname fix for ESM
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loaderPath = path.join(__dirname, "../../renderer/loader/loader.html");

let loaderWindow;

export function createLoaderWindow() {
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
    return loaderWindow;
}
