let config = {
    launchSettings: {
        loaderWindow: true,
        startMinimized: false,
    },

    windowSettings: {
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
    },
};

// Injector
const injectList = [
    {
        file: "alwaysExpandedPlayer.css",
        condition: (config) => config?.programSettings?.alwaysExpandedPlayer,
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
