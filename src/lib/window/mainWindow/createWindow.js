import { BrowserWindow, ipcMain, session, nativeTheme, app } from "electron";
import { createLoaderWindow } from "../createLoaderWindow.js";
import { applyAddons } from "../../loadAddons.js";
import {
	mergeAddonExperiments,
	getAllAddonExperimentNames,
} from "../../experiments/addonExperiments.js";
import { resolveBuiltinExperiments } from "../../experiments/builtinExperiments.js";
import { getConfig } from "../../configManager.js";
import { getAppIcon } from "../../../config.js";
import { loadRendererPage } from "../../paths.js";
import { API_FUNCTIONS_ORDER } from "../../api/order.js";
import { fileURLToPath } from "url";
import path from "path";
import injector from "../../injector.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const titlebarFolder = path.resolve(__dirname, "..", "..", "titlebar");
const apiBundleFile = path.resolve(__dirname, "..", "..", "api", "bundle.js");
const apiFunctionsDir = path.resolve(__dirname, "..", "..", "api", "functions");
const apiMainFile = path.resolve(__dirname, "..", "..", "api", "main.js");

if (!ipcMain.listenerCount("nmc:get-experiments")) {
	ipcMain.on("nmc:get-experiments", (event) => {
		const config = getConfig();
		event.returnValue = {
			experiments: mergeAddonExperiments(
				resolveBuiltinExperiments(config?.experiments ?? {}),
			),
			managedNames: getAllAddonExperimentNames(),
		};
	});
}

let mainWindow;
let cachedApiJs = null;
let cachedTitleBarCss = null;
let cachedTitleBarJs = null;

export function createWindow(config) {
	const startMinimized = config?.launchSettings?.startMinimized;
	const titleBarEnabled = config.windowSettings?.titleBar?.enable;
	const transparentBg = config.windowSettings?.transparentBg;

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
		transparent: transparentBg,
		backgroundColor: transparentBg
			? "#00000000"
			: nativeTheme.shouldUseDarkColors
				? "#0D0D0D"
				: "#E6E6E6",
		icon: getAppIcon(config?.experiments),
		frame: !titleBarEnabled,
		roundedCorners: true,
		show: false,
		webPreferences: {
			webSecurity: false,
			nodeIntegration: false,
			contextIsolation: true,
			spellcheck: false,
			backgroundThrottling: true,
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
		if (global.__nmcQuitting) return;
		event.preventDefault();
		mainWindow.hide();
	});

	return mainWindow;

	function setupCSP() {
		session.defaultSession.webRequest.onHeadersReceived(
			(details, callback) => {
				const headers = details.responseHeaders || {};
				delete headers["content-security-policy"];
				delete headers["Content-Security-Policy"];
				callback({ responseHeaders: headers });
			},
		);
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

	function isOnYandexMusic() {
		if (!mainWindow || mainWindow.isDestroyed()) return false;
		return mainWindow.webContents.getURL().includes("music.yandex.ru");
	}

	function runInPage(code) {
		if (!isOnYandexMusic()) return;
		mainWindow.webContents
			.executeJavaScript(
				`(() => {
					if (!location.host.includes("music.yandex.ru")) return;
					${code}
				})()`,
			)
			.catch(console.error);
	}

	function setupLoadHandlers() {
		mainWindow.webContents.on("did-finish-load", () => {
			if (!isOnYandexMusic()) return;

			injector(mainWindow, config);

			if (config.programSettings.addons.enable) {
				applyAddons(mainWindow);
			}

			onFinishLoad();
		});

		mainWindow.webContents.on("did-fail-load", onFailLoad);
	}

	async function onFinishLoad() {
		if (titleBarEnabled) injectTitleBar();
		injectApi();

		if (global.__nmcUpdateGate) {
			try {
				await global.__nmcUpdateGate;
			} catch {
				/* proceed regardless */
			}
		}

		closeLoaderWindow();

		if (!startMinimized) mainWindow.show();
	}

	function injectApi() {
		if (!cachedApiJs) {
			if (fs.existsSync(apiBundleFile)) {
				cachedApiJs = fs.readFileSync(apiBundleFile, "utf-8");
			} else {
				const parts = API_FUNCTIONS_ORDER.map((name) =>
					fs.readFileSync(
						path.join(apiFunctionsDir, `${name}.js`),
						"utf-8",
					),
				);
				const mainJs = fs.readFileSync(apiMainFile, "utf-8");
				cachedApiJs = `${parts.join("\n")}\n${mainJs}`;
			}
		}
		runInPage(cachedApiJs);
	}

	function injectTitleBar() {
		if (cachedTitleBarCss === null) {
			cachedTitleBarCss = fs.readFileSync(
				path.join(titlebarFolder, "titlebar.css"),
				"utf-8",
			);
		}

		if (cachedTitleBarJs === null) {
			cachedTitleBarJs = fs.readFileSync(
				path.join(titlebarFolder, "titlebar.js"),
				"utf-8",
			);
		}

		const css = cachedTitleBarCss;
		const js = cachedTitleBarJs;

		const showNextText =
			config.windowSettings?.titleBar?.nextText?.enable === true;
		const showYandexMusicVersion =
			showNextText &&
			config.windowSettings?.titleBar?.nextText
				?.displayYandexMusicVersion === true;

		const titleBarConfig = {
			showNextText,
			showYandexMusicVersion,
			version: app.getVersion(),
		};

		if (!isOnYandexMusic()) return;

		mainWindow.webContents.insertCSS(css).catch(console.error);
		runInPage(
			`window.__nmcTitleBarConfig = ${JSON.stringify(titleBarConfig)};
			${js}`,
		);
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
			loadRendererPage(mainWindow, "fallback/fallback.html");
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
