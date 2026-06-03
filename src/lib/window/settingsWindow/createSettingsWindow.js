import { BrowserWindow, ipcMain, shell, app, nativeTheme } from "electron";
import { getCurrentVersion } from "../../getAppVersion.js";
import { getConfig, loadConfig, updateConfig } from "../../configManager.js";
import {
	getAddonExperimentOverrides,
	mergeAddonExperiments,
} from "../../addonExperiments.js";
import {
	getBuiltinExperiments,
	resolveBuiltinExperiments,
	getBuiltinExperimentState,
} from "../../builtinExperiments.js";
import { configChangeNeedsRestart } from "../../internalConfig.js";
import { getPaths, isDev, devUrl } from "../../../config.js";
import { fileURLToPath } from "url";

import path from "path";

import {
	loadLanguage,
	getAvailableLanguages,
	getAllStrings,
} from "../../langManager.js";

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let settingsWindow = null;
let _rebuildTray = null;
const GITHUB_TOKEN_PLACEHOLDER = "__has_token__";

function maskConfigForRenderer(config) {
	const safeConfig = structuredClone(config ?? {});

	if (!safeConfig.github) safeConfig.github = {};
	safeConfig.github.accessToken = config?.github?.accessToken
		? GITHUB_TOKEN_PLACEHOLDER
		: null;

	return safeConfig;
}

function normalizeConfigFromRenderer(newConfig) {
	const normalizedConfig = structuredClone(newConfig ?? {});
	const currentConfig = loadConfig();
	const incomingToken = normalizedConfig?.github?.accessToken;

	if (!normalizedConfig.github) normalizedConfig.github = {};

	if (
		incomingToken === GITHUB_TOKEN_PLACEHOLDER ||
		incomingToken === undefined
	) {
		normalizedConfig.github.accessToken =
			currentConfig?.github?.accessToken ?? null;
	}

	return normalizedConfig;
}

export function setTrayRebuilder(fn) {
	_rebuildTray = fn;
}

// Window factory
export function createSettingsWindow() {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.focus();
		return;
	}

	const condemned =
		getBuiltinExperimentState(
			"nm_condemned_mode",
			getConfig()?.experiments ?? {},
		) === "on";

	settingsWindow = new BrowserWindow({
		width: 842,
		height: 587,
		minWidth: 560,
		minHeight: 440,
		frame: false,
		transparent: false,
		resizable: true,
		show: false,
		center: true,
		roundedCorners: true,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0d1117" : "#f4f6f6",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: false,
			additionalArguments: condemned ? ["--nmc-condemned"] : [],
		},
	});

	if (isDev) {
		settingsWindow.loadURL(`${devUrl}/src/renderer/settings/index.html`);
	} else {
		settingsWindow.loadFile(
			path.join(__dirname, "../../../renderer/settings/index.html"),
		);
	}

	settingsWindow.once("ready-to-show", () => settingsWindow.show());

	settingsWindow.on("maximize", () =>
		settingsWindow.webContents.send("settings:maximize-changed", true),
	);

	settingsWindow.on("unmaximize", () =>
		settingsWindow.webContents.send("settings:maximize-changed", false),
	);

	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
}

if (!ipcMain.listenerCount("settings:get-versions")) {
	ipcMain.handle("settings:get-versions", () => {
		return {
			app: getCurrentVersion(),
			electron: process.versions.electron,
			chromium: process.versions.chrome,
			node: process.versions.node,
		};
	});
}

if (!ipcMain.listenerCount("settings:load-config")) {
	ipcMain.handle("settings:load-config", () =>
		maskConfigForRenderer(getConfig()),
	);
}

if (!ipcMain.listenerCount("settings:get-addon-experiments")) {
	ipcMain.handle("settings:get-addon-experiments", () =>
		getAddonExperimentOverrides(),
	);
}

if (!ipcMain.listenerCount("settings:get-builtin-experiments")) {
	ipcMain.handle("settings:get-builtin-experiments", () =>
		getBuiltinExperiments(),
	);
}

function buildLiveExperimentOverrides(config) {
	const resolved = mergeAddonExperiments(
		resolveBuiltinExperiments(config?.experiments ?? {}),
	);
	const overrides = {};
	for (const [name, state] of Object.entries(resolved)) {
		if (state === "on" || state === "default") overrides[name] = state;
	}
	return overrides;
}

function applyExperimentsLive(config) {
	const win = global.mainWindow;
	if (!win || win.isDestroyed()) return;

	const overrides = buildLiveExperimentOverrides(config);
	win.webContents
		.executeJavaScript(
			`window.__nmcApplyExperiments && window.__nmcApplyExperiments(${JSON.stringify(
				overrides,
			)})`,
		)
		.catch(() => {});
}

if (!ipcMain.listenerCount("settings:save-config")) {
	ipcMain.handle("settings:save-config", (_event, newConfig) => {
		const currentConfig = getConfig();
		const normalizedConfig = normalizeConfigFromRenderer(newConfig);
		const { needRestart, experimentsChanged } = configChangeNeedsRestart(
			currentConfig,
			normalizedConfig,
			Object.keys(getBuiltinExperiments()),
		);

		updateConfig(normalizedConfig);

		if (!needRestart && experimentsChanged) {
			applyExperimentsLive(normalizedConfig);
		}

		return { needRestart };
	});
}

ipcMain.on("settings:toggle-maximize", () => {
	if (!settingsWindow || settingsWindow.isDestroyed()) return;

	if (settingsWindow.isMaximized()) {
		settingsWindow.unmaximize();
	} else {
		settingsWindow.maximize();
	}
});

ipcMain.on("settings:minimize", () => {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.minimize();
	}
});

ipcMain.on("settings:close", () => {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.close();
	}
});

ipcMain.on("settings:open-addons-folder", () => {
	const { addonsDirectory } = getPaths();
	shell.openPath(addonsDirectory);
});

ipcMain.on("settings:restart-app", () => {
	app.relaunch();
	app.exit(0);
});

ipcMain.handle("settings:load-lang-strings", () => {
	return getAllStrings?.() ?? {};
});

ipcMain.handle("settings:get-lang-list", () => {
	const { languagesDirectory } = getPaths();
	return getAvailableLanguages(languagesDirectory);
});

ipcMain.on("settings:set-language", (_event, langCode) => {
	const { languagesDirectory } = getPaths();

	loadLanguage(languagesDirectory, langCode);

	const cfg = getConfig();
	cfg.programSettings.language = langCode;
	updateConfig(cfg);

	_rebuildTray?.();

	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.webContents.send(
			"settings:language-changed",
			getAllStrings?.() ?? {},
		);
	}

	BrowserWindow.getAllWindows().forEach((win) => {
		if (win !== settingsWindow) {
			win.webContents.send("change-language", langCode);
		}
	});
});
