const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nmcWindow", {
    minimize: () => ipcRenderer.send("nmc-minimize"),
    maximize: () => ipcRenderer.send("nmc-maximize"),
    close: () => ipcRenderer.send("nmc-close"),
    isMaximized: () => ipcRenderer.invoke("nmc-is-maximized"),
    onMaximizeChange: (callback) => {
        ipcRenderer.on("nmc-maximized", () => callback(true));
        ipcRenderer.on("nmc-unmaximized", () => callback(false));
    },
    removeMaximizeListeners: () => {
        ipcRenderer.removeAllListeners("nmc-maximized");
        ipcRenderer.removeAllListeners("nmc-unmaximized");
    },
});
