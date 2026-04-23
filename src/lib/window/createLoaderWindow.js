import { BrowserWindow } from "electron";
import { appIcon } from "../../config.js";
import path from "path";
import { rendererRoot } from "../rendererPath.js";

const loaderPath = path.join(rendererRoot, "loader/loader.html");

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
