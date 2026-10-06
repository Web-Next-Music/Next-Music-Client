"use strict";

export const injectList = [
	{
		file: "misc/alwaysExpandedPlayer.css",
		condition: (config) => config?.programSettings?.alwaysExpandedPlayer,
	},
	{
		file: "misc/antiSelect.css",
		condition: (config) => config?.programSettings?.antiSelect,
	},
	{
		file: "misc/fastPlay.js",
		condition: (config) => config?.programSettings?.fastPlay,
	},
	{
		file: "lamejs.js",
		condition: (config) => config?.programSettings?.downloader,
	},
	{
		file: "downloader.js",
		type: "js-composite",
		folder: "downloader",
		parts: [
			"utils.js",
			"track-info.js",
			"format-detect.js",
			"crypto.js",
			"cover.js",
			"m4a-meta.js",
			"id3.js",
			"mp3-encode.js",
			"download.js",
			"button.js",
		],
		condition: (config) => config?.programSettings?.downloader,
	},
	{
		file: "listenAlongClient.js",
		type: "js-composite",
		folder: "listenAlong",
		parts: [
			"bootstrap.js",
			"host-and-invite.js",
			"panel-state.js",
			"panel-controls.js",
			"chat-and-avatars.js",
			"playback-timing.js",
			"state-sync.js",
			"status-handler.js",
			"navigation.js",
			"play-state-observers.js",
			"track-identity.js",
			"outgoing-sync.js",
			"lifecycle.js",
		],
		condition: (config) => config?.alpha?.listenAlong?.enable,
	},
	{
		file: "misc/liteVersionMode.js",
	},
	{
		file: "misc/lrclib.js",
		condition: (config) => config?.programSettings?.lrclib,
	},
	{
		file: "misc/nextTitle.js",
		condition: (config) => config?.windowSettings?.nextTitle,
	},
	{
		file: "misc/noAutoZoom.css",
		condition: (config) => config?.programSettings?.disableAutoZoom,
	},
	{
		file: "misc/noAutoZoom.css",
		type: "css-scoped",
		styleId: "listenAlongNoAutoZoom",
		condition: (config) => config?.alpha?.listenAlong?.enable,
		transform: (cssText) => cssText.replace(":root {", "#nm-la-panel-host {"),
	},
	{
		file: "misc/obsWidget.js",
		condition: (config) => config?.programSettings?.obsWidget?.enable,
	},
	{
		file: "misc/siteRPCServer.js",
		condition: (config) =>
			config?.programSettings?.richPresence?.enable !== false,
	},
	{
		file: "misc/trans-bg.css",
		condition: (config) => config?.windowSettings?.transparentBg,
	},
	{
		file: "misc/trans-bg.js",
		condition: (config) => config?.windowSettings?.transparentBg,
	},
	{
		file: "misc/ugcShare.js",
		condition: (config) => config?.programSettings?.ugcShare,
	},
	{
		file: "misc/volumeNormalization.js",
		condition: (config) => config?.programSettings?.volumeNormalization,
	},
	{
		file: "visualizer/visualizer.css",
		condition: (config) => config?.programSettings?.visualizer,
	},
	{
		file: "visualizer.js",
		type: "js-composite",
		folder: "visualizer",
		parts: [
			"bootstrap.js",
			"fft.js",
			"bands-math.js",
			"analyser.js",
			"color.js",
			"render.js",
			"startup.js",
		],
		condition: (config) => config?.programSettings?.visualizer,
	},
];
