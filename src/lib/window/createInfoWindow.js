import { BrowserWindow, nativeImage } from "electron";
import { trayIconPath } from "../../config.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const trayIcon = nativeImage
	.createFromPath(trayIconPath)
	.resize({ width: 24, height: 24 });

let infoWindow = null;

export function createInfoWindow() {
	if (infoWindow && !infoWindow.isDestroyed()) {
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
