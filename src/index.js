import { app, BrowserWindow, protocol, shell } from "electron";
import { checkGitHubStar } from "./lib/githubStarAuth.js";
import { loadConfig } from "./lib/configManager.js";
import path from "path";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
import { appIcon, getPaths, APPNAME } from "./config.js";

const { nextMusicDirectory, addonsDirectory, configFilePath } = getPaths();

// Services
import { createTray } from "./lib/tray.js";
import { checkForUpdates } from "./lib/updater.js";
import { presenceService } from "./lib/richPresence.js";
import { createWindow } from "./lib/window/mainWindow/createWindow.js";
import { setupSplashScreen } from "./lib/splashScreen.js";
import { setupStorePage } from "./lib/storePage/storePage.js";
import { startServer } from "./lib/obsWidget/obsWidget.js";

// App name
app.setName(APPNAME);

// IPC
import setupIpcEvents from "./events.js";

// Flags & Fixes
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

app.commandLine.appendSwitch("js-flags", "--max-old-space-size=512");
app.commandLine.appendSwitch("disk-cache-size", String(50 * 1024 * 1024));
app.commandLine.appendSwitch("v8-pool-size", "0");

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

const enabledFeatures = [
	// CPU: aggressively throttle JS timers in background tabs/hidden windows
	"IntensiveWakeUpThrottling",
	// CPU: throttle unimportant frame timers (cross-origin iframes etc.)
	"ThrottleUnimportantFrameTimers",
];

if (process.platform === "linux") {
	disabledFeatures.push("WaylandWpColorManagerV1");
}

app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
app.commandLine.appendSwitch("enable-features", enabledFeatures.join(","));
app.commandLine.appendSwitch("force-color-profile", "srgb");

// Register custom protocol BEFORE ready
protocol.registerSchemesAsPrivileged([
	{
		scheme: "nextstore",
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
		},
	},
]);

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
app.on("second-instance", () => {
	if (!global.mainWindow) return;

	const win = global.mainWindow;

	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
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

	const listenAlong = config?.alpha?.listenAlong;
	let targetUrl = "https://music.yandex.ru/";

	if (listenAlong?.enable) {
		const params = new URLSearchParams({
			__blackIsland: listenAlong.blackIsland || "",
			__wss: listenAlong.host
				? `${listenAlong.host}:${listenAlong.port || ""}`
				: "",
			__room: listenAlong.roomId || "",
			__clientId: listenAlong.clientId || "",
			__avatarUrl: listenAlong.avatarUrl || "",
		});

		targetUrl = "https://music.yandex.ru/?" + params.toString();
	}

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
		setupStorePage();
	}

	// IPC
	setupIpcEvents(mainWindow);

	// Tray
	createTray(
		appIcon,
		mainWindow,
		nextMusicDirectory,
		addonsDirectory,
		configFilePath,
		config,
	);

	// Updates
	if (config.programSettings?.checkUpdates) {
		checkForUpdates();
	}

	// OBS widget
	if (config?.programSettings?.obsWidget) {
		startServer({ port: 4091 });
	}

	// Discord rich presence — only start if enabled
	if (config.programSettings?.richPresence?.enable) {
		checkGitHubStar()
			.then(({ hasStarred }) => {
				presenceService(hasStarred);
			})
			.catch(() => {
				presenceService(false);
			});
	}
});
