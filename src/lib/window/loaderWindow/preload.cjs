"use strict";

const { contextBridge, ipcRenderer } = require("electron");

if (process.argv.includes("--nmc-condemned")) {
	const applyClass = () => document.documentElement.classList.add("condemned");

	if (document.documentElement) {
		applyClass();
	} else {
		const observer = new MutationObserver(() => {
			if (document.documentElement) {
				observer.disconnect();
				applyClass();
			}
		});
		observer.observe(document, { childList: true });
	}
}

contextBridge.exposeInMainWorld("nmcUpdate", {
	// main → renderer
	onAvailable: (cb) => {
		const handler = (_e, info) => cb(info);
		ipcRenderer.on("nmc-update:available", handler);
		return () => ipcRenderer.off("nmc-update:available", handler);
	},
	onProgress: (cb) => {
		const handler = (_e, info) => cb(info);
		ipcRenderer.on("nmc-update:progress", handler);
		return () => ipcRenderer.off("nmc-update:progress", handler);
	},
	onStatus: (cb) => {
		const handler = (_e, info) => cb(info);
		ipcRenderer.on("nmc-update:status", handler);
		return () => ipcRenderer.off("nmc-update:status", handler);
	},
	onError: (cb) => {
		const handler = (_e, info) => cb(info);
		ipcRenderer.on("nmc-update:error", handler);
		return () => ipcRenderer.off("nmc-update:error", handler);
	},

	// renderer → main
	start: () => ipcRenderer.send("nmc-update:start"),
	cancel: () => ipcRenderer.send("nmc-update:cancel"),
});
