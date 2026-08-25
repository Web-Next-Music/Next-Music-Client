"use strict";

export const injectList = [
	{
		file: "alwaysExpandedPlayer.css",
		condition: (config) => config?.programSettings?.alwaysExpandedPlayer,
	},
	{
		file: "antiSelect.css",
		condition: (config) => config?.programSettings?.antiSelect,
	},
	{
		file: "fastPlay.js",
		condition: (config) => config?.programSettings?.fastPlay,
	},
	{
		file: "lamejs.js",
		condition: (config) => config?.programSettings?.downloader,
	},
	{
		file: "downloader.js",
		condition: (config) => config?.programSettings?.downloader,
	},
	{
		file: "listenAlongClient.js",
		condition: (config) => config?.alpha?.listenAlong?.enable,
	},
	{
		file: "liteVersionMode.js",
	},
	{
		file: "lrclib.js",
		condition: (config) => config?.programSettings?.lrclib,
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
		condition: (config) => config?.programSettings?.obsWidget?.enable,
	},
	{
		file: "siteRPCServer.js",
		condition: (config) =>
			config?.programSettings?.richPresence?.enable !== false,
	},
	{
		file: "trans-bg.js",
		condition: (config) => config?.windowSettings?.transparentBg,
	},
	{
		file: "ugcShare.js",
		condition: (config) => config?.programSettings?.ugcShare,
	},
	{
		file: "volumeNormalization.js",
		condition: (config) => config?.alpha?.volumeNormalization,
	},
];
