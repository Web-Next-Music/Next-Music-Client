import { BrowserWindow, session, nativeTheme, app } from "electron";
import { getUserLogin } from "./userLogin.js";
import { registerHandlers, sync } from "../../ipc/registry.js";
import { createLoaderWindow } from "../createLoaderWindow.js";
import { registerEarlyAddons } from "../../addons/index.js";
import {
	mergeAddonExperiments,
	getAllAddonExperimentNames,
} from "../../experiments/addonExperiments.js";
import { resolveBuiltinExperiments } from "../../experiments/builtinExperiments.js";
import { getConfig } from "../../configManager.js";
import { getAppIcon } from "../../../config.js";
import { loadRendererPage } from "../../paths.js";
import {
	API_FUNCTIONS_ORDER,
	API_FUNCTION_SUBMODULES,
} from "../../api/order.js";
import { fileURLToPath } from "url";
import path from "path";
import { prepareEarlyInjector } from "../../injector/index.js";
import { transpileJsx } from "../../jsx/transform.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const titlebarFolder = path.resolve(__dirname, "..", "..", "titlebar");
const apiBundleFile = path.resolve(__dirname, "..", "..", "api", "bundle.js");
const apiFunctionsDir = path.resolve(__dirname, "..", "..", "api", "functions");
const apiMainFile = path.resolve(__dirname, "..", "..", "api", "main.js");

function inlineCssFiles(source, baseDir) {
	return source.replace(/__CSS_FILE__\(\s*["'](.+?)["']\s*\)/g, (_, rel) =>
		JSON.stringify(fs.readFileSync(path.join(baseDir, rel), "utf-8")),
	);
}

async function readApiUnit(baseDir, name) {
	const jsxPath = path.join(baseDir, `${name}.jsx`);
	if (fs.existsSync(jsxPath)) {
		const transpiled = await transpileJsx(
			fs.readFileSync(jsxPath, "utf-8"),
			jsxPath,
		);
		return inlineCssFiles(transpiled, baseDir);
	}
	return inlineCssFiles(
		fs.readFileSync(path.join(baseDir, `${name}.js`), "utf-8"),
		baseDir,
	);
}

async function readApiFunctionSource(name) {
	const submodules = API_FUNCTION_SUBMODULES[name];
	if (submodules) {
		const baseDir = path.join(apiFunctionsDir, name);
		const parts = await Promise.all(
			submodules.map((sub) => readApiUnit(baseDir, sub)),
		);
		return parts.join("\n");
	}
	return readApiUnit(apiFunctionsDir, name);
}

registerHandlers({
	"nmc:get-user-login": (event) => getUserLogin(event, mainWindow),
	"nmc:early-injector": sync((event) => {
		if (
			!mainWindow ||
			event.sender !== mainWindow.webContents ||
			event.senderFrame !== mainWindow.webContents.mainFrame
		)
			return null;
		try {
			const url = new URL(event.senderFrame.url);
			if (url.protocol !== "https:" || url.hostname !== "music.yandex.ru")
				return null;
			return prepareEarlyInjector(getConfig());
		} catch (error) {
			console.error("[Injector] Early preparation failed:", error);
			return null;
		}
	}),
	"nmc:get-experiments": sync(() => {
		const config = getConfig();
		return {
			experiments: mergeAddonExperiments(
				resolveBuiltinExperiments(config?.experiments ?? {}),
			),
			managedNames: getAllAddonExperimentNames(),
		};
	}),
});

let mainWindow;
let cachedApiJs = null;
let cachedTitleBarCss = null;
let cachedTitleBarJs = null;

export function createWindow(config) {
	const startMinimized = config?.launchSettings?.startMinimized;
	const titleBarEnabled = config.windowSettings?.titleBar?.enable;
	const transparentBg = config.windowSettings?.transparentBg;
	const showSplash =
		config.launchSettings.splashScreen &&
		!startMinimized &&
		!config.launchSettings.loaderWindow;
	let navigationId = 0;
	let splashPending = showSplash;
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
			// Listen Along polls the player from the page, which stops
			// working the moment the hidden window gets throttled.
			backgroundThrottling: !config?.alpha?.listenAlong?.enable,
			additionalArguments: [
				...(titleBarEnabled ? ["--nmc-titlebar"] : []),
				...(config?.programSettings?.volumeNormalization ? ["--nmc-r128"] : []),
				...(config?.programSettings?.visualizer ? ["--nmc-vis"] : []),
				`--nmc-experiments=${JSON.stringify(mergeAddonExperiments(resolveBuiltinExperiments(config?.experiments ?? {})))}`,
			],
			preload: path.join(__dirname, "preload.cjs"),
		},
	});

	mainWindow.earlyAddonsReady = registerEarlyAddons(mainWindow);
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

	function isOnYandexMusic() {
		if (!mainWindow || mainWindow.isDestroyed()) return false;
		return mainWindow.webContents.getURL().includes("music.yandex.ru");
	}

	function runInPage(code) {
		if (!isOnYandexMusic()) return;
		return mainWindow.webContents
			.executeJavaScript(
				`(() => {
					if (!location.host.includes("music.yandex.ru")) return;
					${code}
				})()`,
			)
			.catch(console.error);
	}

	function setupLoadHandlers() {
		mainWindow.webContents.on(
			"did-start-navigation",
			(_event, url, isInPlace, isMainFrame) => {
				if (!isMainFrame || isInPlace) return;
				navigationId++;
				if (splashPending && url.startsWith("https://music.yandex.ru/")) {
					splashPending = false;
					mainWindow.hide();
				}
			},
		);
		mainWindow.webContents.on("did-finish-load", () => {
			if (!isOnYandexMusic()) {
				if (
					mainWindow.webContents.getURL().includes("/fallback/fallback.html")
				) {
					closeLoaderWindow();
					if (!startMinimized) mainWindow.show();
				}
				return;
			}

			onFinishLoad();
		});

		mainWindow.webContents.on("did-fail-load", onFailLoad);
	}

	async function onFinishLoad() {
		const currentNavigation = navigationId;
		if (titleBarEnabled) injectTitleBar();
		await injectApi();
		await waitForExperiments();
		if (
			mainWindow.isDestroyed() ||
			currentNavigation !== navigationId ||
			!isOnYandexMusic()
		)
			return;

		if (global.__nmcUpdateGate) {
			try {
				await global.__nmcUpdateGate;
			} catch {
				/* proceed regardless */
			}
		}

		if (
			mainWindow.isDestroyed() ||
			currentNavigation !== navigationId ||
			!isOnYandexMusic()
		)
			return;
		closeLoaderWindow();
		if (!startMinimized) mainWindow.show();
	}

	async function waitForExperiments() {
		let timeout;
		try {
			await Promise.race([
				mainWindow.webContents.executeJavaScript(`new Promise((resolve) => {
					if (window.__nmcExperimentsDone) return resolve();
					window.addEventListener("__nmcExperimentsApplied", resolve, { once: true });
					if (window.__nmcExperimentsDone) resolve();
				})`),
				new Promise((resolve) => {
					timeout = setTimeout(() => {
						console.warn("[Startup] Experiments wait timed out");
						resolve();
					}, 20_000);
				}),
			]);
		} catch {
		} finally {
			clearTimeout(timeout);
		}
	}

	async function injectApi() {
		if (!cachedApiJs) {
			if (fs.existsSync(apiBundleFile)) {
				cachedApiJs = fs.readFileSync(apiBundleFile, "utf-8");
			} else {
				const parts = await Promise.all(
					API_FUNCTIONS_ORDER.map((name) => readApiFunctionSource(name)),
				);
				const mainJs = fs.readFileSync(apiMainFile, "utf-8");
				cachedApiJs = `${parts.join("\n")}\n${mainJs}`;
			}
		}
		return runInPage(cachedApiJs);
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
			config.windowSettings?.titleBar?.nextText?.displayYandexMusicVersion ===
				true;

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
		if (!isMainFrame || errorCode === -3) return;

		console.error("[Startup] Main page failed to load:", {
			errorCode,
			errorDescription,
		});
		if (validatedURL.includes("/fallback/fallback.html")) {
			closeLoaderWindow();
			if (!startMinimized) mainWindow.show();
			return;
		}
		loadRendererPage(mainWindow, "fallback/fallback.html");
	}

	function setupInitialVisibility() {
		if (config.launchSettings.startMinimized) {
			mainWindow.hide();
		} else if (showSplash) {
			mainWindow.show();
		}
	}
}
