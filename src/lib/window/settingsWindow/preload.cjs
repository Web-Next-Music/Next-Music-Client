const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
	getVersions: () => ipcRenderer.invoke("settings:get-versions"),

	loadConfig: () => ipcRenderer.invoke("settings:load-config"),

	saveConfig: (config) => ipcRenderer.invoke("settings:save-config", config),

	toggleMaximize: () => ipcRenderer.send("settings:toggle-maximize"),

	onMaximizeChange: (cb) => {
		ipcRenderer.removeAllListeners("settings:maximize-changed");
		ipcRenderer.on("settings:maximize-changed", (_event, isMaximized) =>
			cb(isMaximized),
		);
	},

	minimizeWindow: () => ipcRenderer.send("settings:minimize"),

	closeWindow: () => ipcRenderer.send("settings:close"),

	openAddonsFolder: () => ipcRenderer.send("settings:open-addons-folder"),

	restartApp: () => ipcRenderer.send("settings:restart-app"),

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
});
