import { app, BrowserWindow, shell } from "electron";
import { checkGitHubStar } from "./lib/githubStarAuth.js";
import { joinByInvite, inviteCodeFromUrl } from "./lib/listenAlong/service.js";
import { loadConfig } from "./lib/configManager.js";
import path from "path";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
import { getAppIcon, getPaths, APPNAME } from "./config.js";

const { nextMusicDirectory, addonsDirectory, configFilePath } = getPaths();

// Services
import { createTray } from "./lib/tray.js";
import { initUpdater } from "./lib/update/index.js";
import { presenceService, initSiteRPC } from "./lib/richPresence.js";
import { createWindow } from "./lib/window/mainWindow/createWindow.js";
import { setupSplashScreen } from "./lib/splashScreen.js";
import { setupStoreIpc } from "./lib/storePage/storeIpc.js";
import { startServer } from "./lib/obsWidget/obsWidget.js";
import { startListenAlong } from "./lib/listenAlong/service.js";

// App name
app.setName(APPNAME);

// IPC
import setupIpcEvents from "./events.js";

// Flags & Fixes
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disk-cache-size", String(50 * 1024 * 1024));

if (process.platform === "linux") {
	app.commandLine.appendSwitch("disable-dev-shm-usage");
}

const disabledFeatures = [
	"SpareRendererForSitePerProcess",
	"BackForwardCache",
	"MediaRouter",
	"Translate",
	"AutofillServerCommunication",
];

const startupConfig = loadConfig();
const listenAlongEnabled = !!startupConfig?.alpha?.listenAlong?.enable;

const enabledFeatures = [];

if (!listenAlongEnabled) {
	// CPU: aggressively throttle JS timers in background tabs/hidden windows
	enabledFeatures.push("IntensiveWakeUpThrottling");
	// CPU: throttle unimportant frame timers (cross-origin iframes etc.)
	enabledFeatures.push("ThrottleUnimportantFrameTimers");
}

if (process.platform === "linux") {
	disabledFeatures.push("WaylandWpColorManagerV1");
}

app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));

if (enabledFeatures.length) {
	app.commandLine.appendSwitch("enable-features", enabledFeatures.join(","));
}
app.commandLine.appendSwitch("force-color-profile", "srgb");

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient("nextmusic", process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient("nextmusic");
}

function handleDeepLink(url) {
	const code = inviteCodeFromUrl(url);
	if (!code) return;

	const result = joinByInvite(code);
	const win = global.mainWindow;

	if (win) {
		if (win.isMinimized()) win.restore();
		win.show();
		win.focus();
	}

	win?.webContents.send("la:joined-by-link", result);
}

function deepLinkFromArgv(argv) {
	return argv.find((arg) => arg.startsWith("nextmusic://")) ?? null;
}

// Allow self-signed certificates
app.on(
	"certificate-error",
	(event, _webContents, _url, _error, _cert, callback) => {
		event.preventDefault();
		callback(true);
	},
);

// Single Instance Lock
const isSingleInstance = app.requestSingleInstanceLock();

if (!isSingleInstance) {
	app.quit();
	process.exit(0);
}

// second instance focus
app.on("second-instance", (_event, argv) => {
	const url = deepLinkFromArgv(argv);
	if (url) {
		handleDeepLink(url);
		return;
	}

	if (!global.mainWindow) return;

	const win = global.mainWindow;

	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
});

let pendingDeepLink = deepLinkFromArgv(process.argv);

app.on("open-url", (event, url) => {
	event.preventDefault();
	if (app.isReady()) handleDeepLink(url);
	else pendingDeepLink = url;
});

// Window Lifecycle
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
	const hasNoWindows = BrowserWindow.getAllWindows().length === 0;

	if (hasNoWindows && global.mainWindow) {
		global.mainWindow = createWindow();
	}
});

// App Initialization
let mainWindow;

app.whenReady().then(() => {
	const config = loadConfig();

	mainWindow = createWindow(config);
	global.mainWindow = mainWindow;

	const targetUrl = "https://music.yandex.ru/";

	// Splash screen or direct load
	if (
		config.launchSettings?.splashScreen &&
		!config.launchSettings?.startMinimized &&
		!config.launchSettings?.loaderWindow
	) {
		setupSplashScreen(mainWindow, targetUrl);
	} else {
		mainWindow.loadURL(targetUrl);
	}

	// Addons store page
	if (config.programSettings?.addons?.enable) {
		setupStoreIpc();
	}

	// IPC
	setupIpcEvents(mainWindow);

	// Tray
	createTray(
		getAppIcon(config?.experiments),
		mainWindow,
		nextMusicDirectory,
		addonsDirectory,
		configFilePath,
		config,
	);

	initUpdater(config);

	// OBS widget
	if (config?.programSettings?.obsWidget) {
		startServer({ port: 4091 });
	}

	startListenAlong();

	if (pendingDeepLink) {
		const url = pendingDeepLink;
		pendingDeepLink = null;
		mainWindow.webContents.once("did-finish-load", () => {
			handleDeepLink(url);
		});
	}

	// Discord rich presence - only start if enabled
	if (config.programSettings?.richPresence?.enable) {
		initSiteRPC();

		checkGitHubStar()
			.then(({ hasStarred }) => {
				presenceService(hasStarred);
			})
			.catch(() => {
				presenceService(false);
			});
	}
});
