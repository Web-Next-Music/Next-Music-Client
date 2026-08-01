"use strict";

import { app } from "electron";
import path from "path";
import { getBuiltinExperimentState } from "./lib/experiments/builtinExperiments.js";

export const isDev = !app.isPackaged;
export const devUrl = "http://localhost:6788";
export const APPNAME = `next-music`;

// App name
app.setName(APPNAME);

// __dirname fix for ESM
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getAppIcon(userExperiments = {}) {
	return getBuiltinExperimentState("nm_condemned_mode", userExperiments) ===
		"on"
		? path.join(__dirname, "assets/nm-icons/icon-256-condemned.png")
		: path.join(__dirname, "assets/nm-icons/icon-256.png");
}

export function getTrayIconPath(userExperiments = {}) {
	return getBuiltinExperimentState("nm_condemned_mode", userExperiments) ===
		"on"
		? path.join(__dirname, "assets/nm-icons/nm-tray-condemned.png")
		: path.join(__dirname, "assets/nm-icons/nm-tray.png");
}

// Default configuration
export const defaultConfig = {
	launchSettings: {
		loaderWindow: true,
		startMinimized: false,
		splashScreen: true,
	},

	windowSettings: {
		titleBar: {
			enable: true,
			nextText: {
				enable: true,
				displayYandexMusicVersion: false,
			},
		},
		alwaysOnTop: false,
		freeWindowResize: false,
		nextTitle: true,
		transparentBg: false,
	},

	programSettings: {
		richPresence: {
			enable: true,
			rpcTitle: "Next Music",
			largeImageUrl:
				"https://github.com/Web-Next-Music/Next-Music-Client",
			buttons: {
				trackButton: true,
				githubButton: true,
				listenAlongButton: false,
			},
		},
		addons: {
			enable: true,
			onlineScripts: [],
		},
		checkUpdates: true,
		downloader: true,
		obsWidget: false,
		alwaysExpandedPlayer: false,
		ugcShare: true,
		fastPlay: true,
		lrclib: false,
		disableAutoZoom: false,
		antiSelect: false,
		language: "en",
	},

	alpha: {
		volumeNormalization: false,
		listenAlong: {
			enable: false,
			blackIsland: false,
			host: "127.0.0.1",
			port: 7080,
			roomId: "",
			clientId: "",
			hostToken: "",
		},
	},

	experiments: {},

	github: {
		accessToken: null,
		refreshToken: null,
		expiresAt: null,
	},
};

// Paths
export function getPaths() {
	const userData = app.getPath("userData");

	return {
		nextMusicDirectory: userData,
		addonsDirectory: path.join(userData, "Addons"),
		languagesDirectory: path.join(userData, "Languages"),
		configFilePath: path.join(userData, "Config.json"),
	};
}
