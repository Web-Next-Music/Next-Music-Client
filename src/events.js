import { BrowserWindow, shell } from "electron";
import {
	connectGitHubDeviceFlow,
	disconnectGitHub,
	checkGitHubStar,
} from "./lib/githubStarAuth.js";
import { getConfig } from "./lib/configManager.js";
import { registerHandlers, on } from "./lib/ipc/registry.js";
import {
	resolveTrackDownload,
	downloadTrackAudio,
} from "./lib/trackDownloadInfo.js";

export default function registerEvents(mainWindow) {

	const win = () => global.mainWindow ?? mainWindow;

	registerHandlers({
		"nmc:track-download-info": resolveTrackDownload,
				"nmc:track-download-audio": downloadTrackAudio,
		"nmc-minimize": on(() => win().minimize()),
		"nmc-maximize": on(() => {
			if (win().isMaximized()) win().unmaximize();
			else win().maximize();
		}),
		"nmc-close": on(() => win().hide()),
		"nmc-is-maximized": () => win().isMaximized(),

		"github:star-status": async () => await checkGitHubStar(),
		"github:has-token": () => ({
			hasToken: !!getConfig().github?.accessToken,
		}),
		"github:connect": async (event) => {
			const sender = BrowserWindow.fromWebContents(event.sender);
			return await connectGitHubDeviceFlow(
				(info) => sender?.webContents.send("github:device-code", info),
				(secondsLeft) =>
					sender?.webContents.send("github:device-progress", secondsLeft),
			);
		},
		"github:disconnect": () => {
			disconnectGitHub();
		},

		"settings:open-external": (_event, url) => {
			shell.openExternal(url);
		},
	});
}
