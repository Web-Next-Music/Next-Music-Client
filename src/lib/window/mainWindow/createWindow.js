import { BrowserWindow, session, nativeTheme } from "electron";
import { createLoaderWindow } from "../createLoaderWindow.js";
import { applyAddons } from "../../loadAddons.js";
import { mergeAddonExperiments } from "../../addonExperiments.js";
import { resolveBuiltinExperiments } from "../../builtinExperiments.js";
import { appIcon } from "../../../config.js";
import { fileURLToPath } from "url";
import path from "path";
import injector from "../../injector.js";
import fs from "fs";

import pkg from "../../../../package.json" with { type: "json" };
const CURRENT_VERSION = pkg.version;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const titlebarFolder = path.resolve(__dirname, "..", "..", "titlebar");
const apiFunctionsDir = path.resolve(__dirname, "..", "..", "api", "functions");
const apiMainFile = path.resolve(__dirname, "..", "..", "api", "main.js");
const apiFunctionsOrder = [
	"utils",
	"toasts",
	"filePatch",
	"player",
	"customTracks",
];

let mainWindow;

export function createWindow(config) {
	const startMinimized = config?.launchSettings?.startMinimized;
	const titleBarEnabled = config.windowSettings?.titleBar?.enable;

	let loaderWindow;
	if (config.launchSettings.loaderWindow && !startMinimized) {
		loaderWindow = createLoaderWindow();
	}

	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		autoHideMenuBar: true,
		minWidth: config.windowSettings.freeWindowResize ? 1 : 800,
		minHeight: config.windowSettings.freeWindowResize ? 1 : 650,
		alwaysOnTop: config.windowSettings.alwaysOnTop,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0D0D0D" : "#E6E6E6",
		icon: appIcon,
		frame: !titleBarEnabled,
		roundedCorners: true,
		show: false,
		webPreferences: {
			webSecurity: false,
			nodeIntegration: false,
			contextIsolation: true,
			additionalArguments: [
				...(titleBarEnabled ? ["--nmc-titlebar"] : []),
				`--nmc-experiments=${JSON.stringify(mergeAddonExperiments(resolveBuiltinExperiments(config?.experiments ?? {})))}`,
			],
			preload: path.join(__dirname, "preload.cjs"),
		},
	});

	setupCSP();
	setupTitleBarEvents();
	setupInputHandlers();
	setupLoadHandlers();
	setupInitialVisibility();

	mainWindow.on("close", (event) => {
		event.preventDefault();
		mainWindow.hide();
	});

	return mainWindow;

	function setupCSP() {
		session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
			const headers = details.responseHeaders || {};
			delete headers["content-security-policy"];
			delete headers["Content-Security-Policy"];
			callback({ responseHeaders: headers });
		});
	}

	function setupTitleBarEvents() {
		if (!titleBarEnabled) return;

		mainWindow.on("maximize", () =>
			mainWindow.webContents.send("nmc-maximized"),
		);

		mainWindow.on("unmaximize", () =>
			mainWindow.webContents.send("nmc-unmaximized"),
		);
	}

	function setupInputHandlers() {
		mainWindow.webContents.on("before-input-event", (event, input) => {
			if (input.key === "Alt") event.preventDefault();
		});
	}

	function setupLoadHandlers() {
		mainWindow.webContents.on("did-finish-load", () => {
			const url = mainWindow.webContents.getURL();
			if (!url.includes("music.yandex.ru")) return;

			injector(mainWindow, config);

			if (config.programSettings.addons.enable) {
				applyAddons(mainWindow);
			}

			onFinishLoad();
		});

		mainWindow.webContents.on("did-fail-load", onFailLoad);
	}

	function onFinishLoad() {
		if (titleBarEnabled) injectTitleBar();
		injectApi();
		closeLoaderWindow();

		if (!startMinimized) mainWindow.show();
	}

	function injectApi() {
		const parts = apiFunctionsOrder.map((name) =>
			fs.readFileSync(path.join(apiFunctionsDir, `${name}.js`), "utf-8"),
		);
		const mainJs = fs.readFileSync(apiMainFile, "utf-8");
		const js = `(() => {\n${parts.join("\n")}\n${mainJs}\n})();`;
		mainWindow.webContents.executeJavaScript(js).catch(console.error);
	}

	function injectTitleBar() {
		const css = fs.readFileSync(
			path.join(titlebarFolder, "titlebar.css"),
			"utf-8",
		);

		const js = fs.readFileSync(
			path.join(titlebarFolder, "titlebar.js"),
			"utf-8",
		);

		const showNextText =
			config.windowSettings?.titleBar?.nextText?.enable === true;
		const showYandexMusicVersion =
			showNextText &&
			config.windowSettings?.titleBar?.nextText?.displayYandexMusicVersion ===
				true;

		const titleBarConfig = {
			showNextText,
			showYandexMusicVersion,
			version: CURRENT_VERSION,
		};

		mainWindow.webContents
			.executeJavaScript(
				`window.__nmcTitleBarConfig = ${JSON.stringify(titleBarConfig)};`,
			)
			.catch(console.error);

		mainWindow.webContents.insertCSS(css).catch(console.error);
		mainWindow.webContents.executeJavaScript(js).catch(console.error);
	}

	function closeLoaderWindow() {
		if (!config.launchSettings.loaderWindow || !loaderWindow) return;

		try {
			loaderWindow.close();
			loaderWindow = null;
		} catch {
			console.log("Loader window is missing");
		}
	}

	function onFailLoad(
		event,
		errorCode,
		errorDescription,
		validatedURL,
		isMainFrame,
	) {
		if (isMainFrame) {
			mainWindow.loadFile(
				__dirname,
				"../../../renderer/fallback/fallback.html",
			);
		}
	}

	function setupInitialVisibility() {
		if (config.launchSettings.startMinimized) {
			mainWindow.hide();
		} else if (!config.launchSettings.loaderWindow) {
			mainWindow.show();
		}
	}
}
