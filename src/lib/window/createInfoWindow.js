import { BrowserWindow, nativeImage } from "electron";
import { trayIconPath } from "../../config.js";
import path from "path";
import { rendererRoot } from "../rendererPath.js";

const trayIcon = nativeImage
	.createFromPath(trayIconPath)
	.resize({ width: 24, height: 24 });

let infoWindow = null;

export function createInfoWindow() {
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

	infoWindow.loadFile(path.join(rendererRoot, "info/info.html"));
	infoWindow.setMenu(null);
	infoWindow.on("closed", () => {
		infoWindow = null;
	});
}
