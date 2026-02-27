let config = {
    launchSettings: {
        loaderWindow: true,
        startMinimized: false,
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
        checkUpdates: true,
    },

    experimental: {
        volumeNormalization: false,
        listenAlong: {
            enable: false,
            blackIsland: true,
            host: "127.0.0.1",
            port: 7080,
            roomId: "",
            clientId: "",
            avatarUrl: "",
        },
    },
};

// Injector
const injectList = [
    {
        file: "alwaysExpandedPlayer.css",
        condition: (config) => config?.programSettings?.alwaysExpandedPlayer,
    },
    {
        file: "listenAlongClient.js",
        condition: (config) => config?.experimental?.listenAlong?.enable,
    },
    {
        file: "nextTitle.js",
        condition: (config) => config?.windowSettings?.nextTitle,
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
        condition: (config) => config?.experimental?.volumeNormalization,
    },
];

module.exports = { config, injectList };
