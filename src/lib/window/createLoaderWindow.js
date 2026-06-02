import { BrowserWindow } from "electron";
import { getAppIcon, isDev, devUrl } from "../../config.js";
import { getConfig } from "../configManager.js";
import { getBuiltinExperimentState } from "../builtinExperiments.js";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let loaderWindow;

export function createLoaderWindow() {
	const experiments = getConfig()?.experiments ?? {};
	const condemned =
		getBuiltinExperimentState("nm_condemned_mode", experiments) === "on";

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
		icon: getAppIcon(experiments),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			additionalArguments: condemned ? ["--nmc-condemned"] : [],
			preload: path.join(__dirname, "loaderWindow/preload.cjs"),
		},
	});

	if (isDev) {
		loaderWindow.loadURL(`${devUrl}/src/renderer/loader/index.html`);
	} else {
		loaderWindow.loadFile(
			path.join(__dirname, "../../renderer/loader/index.html"),
		);
	}

	// Exposed so the update controller can drive the in-window update card.
	global.loaderWindow = loaderWindow;

	return loaderWindow;
}
