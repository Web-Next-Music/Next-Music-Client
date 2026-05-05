"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	// Versions & Config
	getVersions: () => ipcRenderer.invoke("settings:get-versions"),
	loadConfig: () => ipcRenderer.invoke("settings:load-config"),
	saveConfig: (config) => ipcRenderer.invoke("settings:save-config", config),

	// Addons & Experiments
	getAddonExperiments: () =>
		ipcRenderer.invoke("settings:get-addon-experiments"),
	getBuiltinExperiments: () =>
		ipcRenderer.invoke("settings:get-builtin-experiments"),

	// Window controls
	toggleMaximize: () => ipcRenderer.send("settings:toggle-maximize"),
	onMaximizeChange: (cb) => {
		ipcRenderer.removeAllListeners("settings:maximize-changed");
		ipcRenderer.on("settings:maximize-changed", (_event, isMaximized) =>
			cb(isMaximized),
		);
	},
	minimizeWindow: () => ipcRenderer.send("settings:minimize"),
	closeWindow: () => ipcRenderer.send("settings:close"),
	restartApp: () => ipcRenderer.send("settings:restart-app"),

	// Addons folder
	openAddonsFolder: () => ipcRenderer.send("settings:open-addons-folder"),

	// Language
	loadLangStrings: () => ipcRenderer.invoke("settings:load-lang-strings"),
	getLangList: () => ipcRenderer.invoke("settings:get-lang-list"),
	setLanguage: (langCode) =>
		ipcRenderer.send("settings:set-language", langCode),
	onLanguageChange: (cb) => {
		ipcRenderer.removeAllListeners("settings:language-changed");
		ipcRenderer.on("settings:language-changed", (_event, strings) =>
			cb(strings),
		);
	},

	// Shell
	openExternal: (url) => ipcRenderer.invoke("settings:open-external", url),

	// GitHub Device Flow
	getGitHubStarStatus: () => ipcRenderer.invoke("github:star-status"),
	getGitHubHasToken: () => ipcRenderer.invoke("github:has-token"),
	connectGitHub: () => ipcRenderer.invoke("github:connect"),
	disconnectGitHub: () => ipcRenderer.invoke("github:disconnect"),

	onGitHubDeviceCode: (cb) => {
		const handler = (_e, info) => cb(info);
		ipcRenderer.on("github:device-code", handler);
		return () => ipcRenderer.off("github:device-code", handler);
	},

	onGitHubDeviceProgress: (cb) => {
		const handler = (_e, seconds) => cb(seconds);
		ipcRenderer.on("github:device-progress", handler);
		return () => ipcRenderer.off("github:device-progress", handler);
	},
});
