local nm = {}

nm.config = {
	launchSettings = {
		loaderWindow = true,
		startMinimized = false,
		splashScreen = true,
	},
	windowSettings = {
		titleBar = {
			enable = true,
			nextText = {
				enable = true,
				displayYandexMusicVersion = false,
			},
		},
		alwaysOnTop = false,
		freeWindowResize = false,
		nextTitle = true,
		transparentBg = false,
	},
	programSettings = {
		richPresence = {
			enable = true,
			rpcTitle = "Next Music",
			largeImageUrl = "https://github.com/Web-Next-Music/Next-Music-Client",
			buttons = {
				trackButton = true,
				githubButton = true,
				listenAlongButton = false,
			},
		},
		addons = {
			enable = true,
			onlineScripts = {},
        },
		obsWidget = {
			enable = false,
			exposeNetwork = false,
		},
		checkUpdates = true,
		downloader = true,
		alwaysExpandedPlayer = false,
		ugcShare = true,
		fastPlay = true,
		lrclib = false,
		disableAutoZoom = false,
		antiSelect = false,
		language = "en",
	},
	alpha = {
		volumeNormalization = false,
		listenAlong = {
			enable = false,
			host = "127.0.0.1",
			port = 7080,
		},
	},
	experiments = {},
}

nm.secrets = {
	github = {
		accessToken = nil,
		refreshToken = nil,
		expiresAt = nil,
	},
	discord = {
		accessToken = nil,
		refreshToken = nil,
		expiresAt = nil,
	},
}

return nm
