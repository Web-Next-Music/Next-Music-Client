import { BrowserWindow, nativeImage } from "electron";
import { getCurrentVersionWV } from "../../lib/getAppVersion.js";
import { getTrayIconPath, getPaths } from "../../config.js";
import { getConfig } from "../../lib/configManager.js";
import { loadRendererPage } from "../paths.js";
import { checkGitHubStar } from "../githubStarAuth.js";
import { registerHandlers, sync } from "../ipc/registry.js";

registerHandlers({
	"get-app-version": sync(() => getCurrentVersionWV()),
	"info-v2:get-init-data": async () => {
		const { languagesDirectory } = getPaths();
		const langCode = getConfig().programSettings?.language ?? "en";
		const { hasStarred } = await checkGitHubStar();

		return { languagesDirectory, langCode, hasStarred };
	},
});

const trayIcon = nativeImage
	.createFromPath(getTrayIconPath(getConfig()?.experiments))
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

	loadRendererPage(infoWindow, "info_v2/index.html");

	infoWindow.setMenu(null);

	infoWindow.on("closed", () => {
		infoWindow = null;
	});
}
