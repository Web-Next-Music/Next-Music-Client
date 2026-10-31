import { BrowserWindow, shell, app, nativeTheme } from "electron";
import { registerHandlers, on } from "../../ipc/registry.js";
import { broadcastToRenderers } from "../../ipc/broadcast.js";
import { getCurrentVersion } from "../../getAppVersion.js";
import { getConfig, updateConfig } from "../../configManager.js";
import {
	getAddonExperimentOverrides,
	mergeAddonExperiments,
} from "../../experiments/addonExperiments.js";
import {
	getBuiltinExperiments,
	resolveBuiltinExperiments,
	getBuiltinExperimentState,
} from "../../experiments/builtinExperiments.js";
import { configChangeNeedsRestart } from "../../internalConfig.js";
import {
	refreshListenAlong,
	refreshDiscordIdentity,
} from "../../listenAlong/service.js";
import {
	hasDiscordIdentity,
	getDiscordUsername,
	ensureDiscordProfile,
	connectDiscordIdentity,
	disconnectDiscordIdentity,
} from "../../listenAlong/discordIdentity.js";
import { getPaths } from "../../../config.js";
import { loadRendererPage } from "../../paths.js";
import { fileURLToPath } from "url";

import path from "path";
import fs from "fs";

import {
	loadLanguage,
	getAvailableLanguages,
	getAllStrings,
	getCurrentLangCode,
} from "../../langManager.js";

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
	const currentConfig = getConfig();
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

export function createSettingsWindow(options = {}) {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.focus();
		if (options.tab) {
			settingsWindow.webContents.send("settings:activate-tab", options.tab);
		}
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
			additionalArguments: [
				...(condemned ? ["--nmc-condemned"] : []),
				...(options.tab ? [`--nmc-tab=${options.tab}`] : []),
			],
		},
	});

	loadRendererPage(settingsWindow, "settings/index.html");

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

function withSettingsWindow(fn) {
	if (settingsWindow && !settingsWindow.isDestroyed()) fn(settingsWindow);
}

registerHandlers({
	"settings:open-window": (_event, tab) => {
		createSettingsWindow({ tab });
	},

	"discord:has-token": async () => {
		if (!hasDiscordIdentity()) return { hasToken: false, username: null };
		await ensureDiscordProfile();
		return { hasToken: true, username: getDiscordUsername() };
	},
	"discord:connect": async () => {
		try {
			const result = await connectDiscordIdentity();
			refreshDiscordIdentity();
			return result;
		} catch (err) {
			return { ok: false, error: err.message };
		}
	},
	"discord:disconnect": () => {
		disconnectDiscordIdentity();
		refreshDiscordIdentity();
	},

	"settings:get-versions": () => ({
		app: getCurrentVersion(),
		electron: process.versions.electron,
		chromium: process.versions.chrome,
		node: process.versions.node,
	}),
	"settings:load-config": () => maskConfigForRenderer(getConfig()),
	"settings:get-addon-experiments": () => getAddonExperimentOverrides(),
	"settings:get-builtin-experiments": () => getBuiltinExperiments(),

	"settings:save-config": (_event, newConfig) => {
		const currentConfig = getConfig();
		const normalizedConfig = normalizeConfigFromRenderer(newConfig);
		normalizedConfig.programSettings.language =
			currentConfig.programSettings.language;
		const { needRestart, experimentsChanged } = configChangeNeedsRestart(
			currentConfig,
			normalizedConfig,
			Object.keys(getBuiltinExperiments()),
		);

		updateConfig(normalizedConfig);

		let applyFailed = false;
		const apply = (fn) => {
			try {
				fn();
			} catch (error) {
				applyFailed = true;
				console.error("[Settings] Failed to apply saved settings:", error);
			}
		};

		if (!needRestart && experimentsChanged) {
			apply(() => applyExperimentsLive(normalizedConfig));
		}

		apply(refreshListenAlong);

		return { needRestart: needRestart || applyFailed, applyFailed };
	},

	"settings:toggle-maximize": on(() =>
		withSettingsWindow((win) =>
			win.isMaximized() ? win.unmaximize() : win.maximize(),
		),
	),
	"settings:minimize": on(() => withSettingsWindow((win) => win.minimize())),
	"settings:close": on(() => withSettingsWindow((win) => win.close())),

	"settings:open-addons-folder": on(() => {
		const { addonsDirectory } = getPaths();
		shell.openPath(addonsDirectory);
	}),
	"settings:restart-app": on(() => {
		app.relaunch();
		app.exit(0);
	}),

	"settings:set-language": (_event, language) => {
		const { languagesDirectory } = getPaths();
		if (!getAvailableLanguages(languagesDirectory).includes(language)) {
			throw new Error("Language is not available");
		}
		JSON.parse(
			fs.readFileSync(
				path.join(languagesDirectory, `${language}.json`),
				"utf-8",
			),
		);

		const config = structuredClone(getConfig());
		config.programSettings.language = language;
		updateConfig(config);

		let applyFailed = false;
		const apply = (fn) => {
			try {
				fn();
			} catch (error) {
				applyFailed = true;
				console.error("[Settings] Failed to apply saved language:", error);
			}
		};
		let languageLoaded = false;
		apply(() => {
			if (
				!loadLanguage(languagesDirectory, language) ||
				getCurrentLangCode() !== language
			) {
				throw new Error("Failed to load language");
			}
			languageLoaded = true;
		});
		if (languageLoaded) {
			apply(() => _rebuildTray?.());
			apply(() =>
				withSettingsWindow((win) =>
					win.webContents.send("settings:language-changed", getAllStrings()),
				),
			);
			apply(() =>
				broadcastToRenderers("change-language", language, {
					except: settingsWindow,
				}),
			);
		}
		return { applyFailed };
	},

	"settings:load-lang-strings": () => getAllStrings?.() ?? {},
	"settings:get-lang-list": () => {
		const { languagesDirectory } = getPaths();
		return getAvailableLanguages(languagesDirectory);
	},
});
