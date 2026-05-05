import { ipcMain, BrowserWindow, shell } from "electron";
import {
	connectGitHubDeviceFlow,
	disconnectGitHub,
	checkGitHubStar,
} from "./lib/githubStarAuth.js";
import { loadConfig } from "./lib/configManager.js";

export default function registerEvents(mainWindow) {
	// Titlebar
	ipcMain.on("nmc-minimize", () => mainWindow.minimize());

	ipcMain.on("nmc-maximize", () => {
		if (mainWindow.isMaximized()) mainWindow.unmaximize();
		else mainWindow.maximize();
	});

	ipcMain.on("nmc-close", () => mainWindow.hide());

	ipcMain.handle("nmc-is-maximized", () => {
		return mainWindow.isMaximized();
	});

	// GitHub handlers
	if (!ipcMain.listenerCount("github:star-status")) {
		ipcMain.handle("github:star-status", async () => {
			// Live check every time
			return await checkGitHubStar();
		});
	}

	if (!ipcMain.listenerCount("github:has-token")) {
		ipcMain.handle("github:has-token", () => {
			const config = loadConfig();
			return { hasToken: !!config.github?.accessToken };
		});
	}

	if (!ipcMain.listenerCount("github:connect")) {
		ipcMain.handle("github:connect", async (event) => {
			const sender = BrowserWindow.fromWebContents(event.sender);
			return await connectGitHubDeviceFlow(
				(info) => sender?.webContents.send("github:device-code", info),
				(secondsLeft) =>
					sender?.webContents.send("github:device-progress", secondsLeft),
			);
		});
	}

	if (!ipcMain.listenerCount("github:disconnect")) {
		ipcMain.handle("github:disconnect", () => {
			disconnectGitHub();
		});
	}

	if (!ipcMain.listenerCount("settings:open-external")) {
		ipcMain.handle("settings:open-external", (_event, url) => {
			shell.openExternal(url);
		});
	}
}
