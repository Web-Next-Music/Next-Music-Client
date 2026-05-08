import { BrowserWindow } from "electron";
import { appIcon, isDev, devUrl } from "../../config.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let loaderWindow;

export function createLoaderWindow() {
	loaderWindow = new BrowserWindow({
		width: 240,
		height: 280,
		backgroundColor: "#000",
		show: true,
		useContentSize: true,
		resizable: false,
		fullscreenable: false,
		movable: true,
		frame: false,
		transparent: false,
		roundedCorners: true,
		icon: appIcon,
	});

	if (isDev) {
		loaderWindow.loadURL(`${devUrl}/src/renderer/loader/index.html`);
	} else {
		loaderWindow.loadFile(
			path.join(__dirname, "../../renderer/loader/index.html"),
		);
	}

	return loaderWindow;
}
