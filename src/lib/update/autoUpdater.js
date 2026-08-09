import { app } from "electron";
import electronUpdater from "electron-updater";
import { t } from "../langManager.js";
import { state } from "./state.js";
import { isNewer } from "./githubRelease.js";
import {
	sendToLoader,
	sendStatus,
	sendError,
	noUpdate,
	presentUpdate,
	registerIpc,
	runCheck,
	resolveGate,
} from "./manualUpdateFlow.js";

const RELEASES_PAGE =
	"https://github.com/Web-Next-Music/Next-Music-Client/releases/latest";

const SAFETY_TIMEOUT_MS = 8000;

export function getAutoUpdater() {
	return electronUpdater.autoUpdater;
}

export function initUpdater(config) {
	const enabled =
		config?.programSettings?.checkUpdates &&
		config?.launchSettings?.loaderWindow &&
		!config?.launchSettings?.startMinimized &&
		app.isPackaged;

	if (!enabled) return;

	global.__nmcUpdateGate = new Promise((resolve) => {
		global.__nmcUpdateGateResolve = resolve;
	});

	registerIpc();

	setTimeout(() => {
		if (!state.presented) resolveGate();
	}, SAFETY_TIMEOUT_MS);

	runCheck().catch((err) => {
		console.error("[Updater] startup check failed:", err);
		resolveGate();
	});
}

export async function runElectronUpdaterCheck() {
	const autoUpdater = getAutoUpdater();
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.removeAllListeners();

	autoUpdater.on("download-progress", (p) => {
		sendToLoader("nmc-update:progress", {
			percent: p.percent,
			transferred: p.transferred,
			total: p.total,
			bytesPerSecond: p.bytesPerSecond,
		});
	});

	autoUpdater.on("update-downloaded", () => {
		sendStatus(t("updater.installing"));
		global.__nmcQuitting = true;
		setTimeout(() => autoUpdater.quitAndInstall(true, true), 200);
	});

	autoUpdater.on("error", (err) => {
		console.error("[Updater] electron-updater error:", err);
		sendError(err?.message || String(err));
		state.started = false;
	});

	let result;
	try {
		result = await autoUpdater.checkForUpdates();
	} catch (err) {
		console.error("[Updater] checkForUpdates failed:", err);
		noUpdate();
		return;
	}

	const latest = result?.updateInfo?.version;
	if (!latest || !isNewer(latest, app.getVersion())) {
		noUpdate();
		return;
	}

	state.releaseInfo = { html_url: RELEASES_PAGE };
	await presentUpdate(latest);
}
