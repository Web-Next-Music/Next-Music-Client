// src/windows/settingsPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    /** Получить версии приложения, Electron, Chromium, Node */
    getVersions: () => ipcRenderer.invoke("settings:get-versions"),

    /** Получить текущий конфиг */
    loadConfig: () => ipcRenderer.invoke("settings:load-config"),

    /** Сохранить весь конфиг сразу (вызывается при каждом изменении поля) */
    saveConfig: (config) => ipcRenderer.invoke("settings:save-config", config),

    /** Развернуть / восстановить окно */
    toggleMaximize: () => ipcRenderer.send("settings:toggle-maximize"),

    /** Подписка на смену состояния maximize */
    onMaximizeChange: (cb) =>
        ipcRenderer.on("settings:maximize-changed", (_event, isMaximized) =>
            cb(isMaximized),
        ),

    /** Свернуть окно настроек */
    minimizeWindow: () => ipcRenderer.send("settings:minimize"),

    /** Закрыть окно настроек */
    closeWindow: () => ipcRenderer.send("settings:close"),

    /** Открыть папку с аддонами */
    openAddonsFolder: () => ipcRenderer.send("settings:open-addons-folder"),

    /** Перезапустить приложение (relaunch + exit) */
    restartApp: () => ipcRenderer.send("settings:restart-app"),

    loadLangStrings: () => ipcRenderer.invoke("settings:load-lang-strings"),

    getLangList: () => ipcRenderer.invoke("settings:get-lang-list"),

    setLanguage: (langCode) =>
        ipcRenderer.send("settings:set-language", langCode),

    onLanguageChange: (cb) =>
        ipcRenderer.on("settings:language-changed", (_event, strings) =>
            cb(strings),
        ),
});
