import { BrowserWindow, nativeImage, ipcMain } from "electron";
import { getCurrentVersionWV } from "../../lib/getAppVersion.js";
import { trayIconPath, getPaths, isDev, devUrl } from "../../config.js";
import { getConfig } from "../../lib/configManager.js";
import { fileURLToPath } from "url";
import { checkGitHubStar } from "../githubStarAuth.js";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!ipcMain.listenerCount("get-app-version")) {
	ipcMain.on("get-app-version", (event) => {
		event.returnValue = getCurrentVersionWV();
	});
}

if (!ipcMain.listenerCount("info-v2:get-init-data")) {
	ipcMain.handle("info-v2:get-init-data", async () => {
		const { languagesDirectory } = getPaths();
		const langCode = getConfig().programSettings?.language ?? "en";
		const { hasStarred } = await checkGitHubStar();

		return {
			languagesDirectory,
			langCode,
			hasStarred,
		};
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
			backgroundThrottling: false,
		},
	});

	if (isDev) {
		infoWindow.loadURL(`${devUrl}/src/renderer/info_v2/index.html`);
	} else {
		infoWindow.loadFile(
			path.join(__dirname, "../../renderer/info_v2/index.html"),
		);
	}

	infoWindow.setMenu(null);

	infoWindow.on("closed", () => {
		infoWindow = null;
	});
}
