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
        checkUpdates: true,
    },

    experimental: {
        volumeNormalization: false,
    },
};

module.exports = config;
