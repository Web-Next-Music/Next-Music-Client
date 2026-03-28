import { ipcMain } from "electron";

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
}
