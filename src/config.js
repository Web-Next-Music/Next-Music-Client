"use strict";
const { app } = require("electron");
const path = require("path");
const fs = require("fs");

const appIcon = path.join(__dirname, "assets/nm-icons/icon-256.png");
const trayIconPath = path.join(__dirname, "assets/nm-icons/nm-tray.png");

// Default configuration
const defaultConfig = {
    launchSettings: {
        loaderWindow: true,
        startMinimized: false,
        splashScreen: true,
    },
    windowSettings: {
        titleBar: {
            enable: true,
            nextText: true,
        },
        alwaysOnTop: false,
        freeWindowResize: false,
        nextTitle: true,
    },

    programSettings: {
        checkUpdates: true,
        language: "en",
        richPresence: {
            enabled: true,
            rpcTitle: "Next Music",
            buttons: {
                trackButton: true,
                githubButton: true,
            },
        },
        addons: {
            enable: true,
            onlineScripts: [],
        },
        obsWidget: false,
        alwaysExpandedPlayer: false,
        disableAutoZoom: false,
    },

    experiments: {
        volumeNormalization: false,
        listenAlong: {
            enable: false,
            blackIsland: false,
            host: "127.0.0.1",
            port: 7080,
            roomId: "",
            clientId: "",
            avatarUrl: "",
        },
    },
};

// Injector list
const injectList = [
    {
        file: "alwaysExpandedPlayer.css",
        condition: (config) => config?.programSettings?.alwaysExpandedPlayer,
    },
    {
        file: "listenAlongClient.js",
        condition: (config) => config?.experiments?.listenAlong?.enable,
    },
    {
        file: "nextStore.js",
        condition: (config) => config?.programSettings?.addons?.enable,
    },
    {
        file: "nextTitle.js",
        condition: (config) => config?.windowSettings?.nextTitle,
    },
    {
        file: "noAutoZoom.css",
        condition: (config) => config?.programSettings?.disableAutoZoom,
    },
    {
        file: "obsWidget.js",
        condition: (config) => config?.programSettings?.obsWidget,
    },
    {
        file: "siteRPCServer.js",
        condition: (config) => config?.programSettings?.richPresence?.enabled,
    },
    {
        file: "volumeNormalization.js",
        condition: (config) => config?.experiments?.volumeNormalization,
    },
];

// Paths
function getPaths() {
    const userData = app.getPath("userData");

    return {
        nextMusicDirectory: userData,
        addonsDirectory: path.join(userData, "Addons"),
        languagesDirectory: path.join(userData, "Languages"),
        configFilePath: path.join(userData, "Config.json"),
    };
}

// Deep merge helper
function deepMerge(target, source) {
    for (const key in source) {
        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key])
        ) {
            if (!target[key]) target[key] = {};
            deepMerge(target[key], source[key]);
        } else {
            if (target[key] === undefined) {
                target[key] = source[key];
            }
        }
    }
    return target;
}

// Load config
function loadConfig() {
    const { configFilePath, addonsDirectory, languagesDirectory } = getPaths();

    if (!fs.existsSync(addonsDirectory)) {
        fs.mkdirSync(addonsDirectory, { recursive: true });
    }

    if (!fs.existsSync(languagesDirectory)) {
        fs.mkdirSync(languagesDirectory, { recursive: true });
    }

    if (!fs.existsSync(configFilePath)) {
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(defaultConfig, null, 4),
        );
        return defaultConfig;
    }

    try {
        const raw = fs.readFileSync(configFilePath, "utf8");
        const userConfig = JSON.parse(raw);
        return deepMerge(userConfig, JSON.parse(JSON.stringify(defaultConfig)));
    } catch (err) {
        console.error("Failed to load config. Using default.", err);
        return defaultConfig;
    }
}

// Save config
function saveConfig(config) {
    const { configFilePath } = getPaths();
    try {
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(config, null, 4),
            "utf-8",
        );
    } catch (err) {
        console.error("Failed to save config:", err);
    }
}

module.exports = {
    appIcon,
    trayIconPath,
    loadConfig,
    saveConfig,
    getPaths,
    defaultConfig,
    injectList,
};
