import { app, shell, dialog } from "electron";
import { registerHandlers, on } from "../ipc/registry.js";
import { t } from "../langManager.js";
import { createLoaderWindow } from "../window/createLoaderWindow.js";
import {
	detectInstallType,
	isElectronUpdaterType,
	isWindowsInstallerType,
	isSystemPackageType,
} from "./installType.js";
import { state } from "./state.js";
import { getAutoUpdater, runElectronUpdaterCheck } from "./autoUpdater.js";
import { fetchLatestRelease, isNewer } from "./githubRelease.js";
import {
	runWindowsInstallerUpdate,
	runSystemPackageUpdate,
} from "./installers.js";

const RELEASES_PAGE =
	"https://github.com/Web-Next-Music/Next-Music-Client/releases/latest";

export async function checkForUpdates() {
	if (!app.isPackaged) {
		console.log("[Updater] Skipped manual check in dev build.");
		return;
	}

	state.manualMode = true;
	state.gateResolved = true;
	state.presented = false;
	state.started = false;

	state.installType = detectInstallType();
	registerIpc();

	let loader = getLoader();
	if (!loader) {
		loader = createLoaderWindow();
		global.loaderWindow = loader;
		state.createdManualLoader = true;
	}

	try {
		await runCheck();
	} catch (err) {
		console.error("[Updater] manual check failed:", err);
		noUpdate();
	}
}

export async function runCheck() {
	state.installType = detectInstallType();
	console.log("[Updater] install type:", state.installType);

	if (isElectronUpdaterType(state.installType)) {
		await runElectronUpdaterCheck();
	} else {
		await runManualCheck();
	}
}

export async function runManualCheck() {
	let release;
	try {
		release = await fetchLatestRelease();
	} catch (err) {
		console.error("[Updater] GitHub fetch failed:", err);
		noUpdate();
		return;
	}

	const latest = release?.tag_name || release?.name;
	if (!latest) {
		if (release?.message)
			console.warn("[Updater] GitHub API:", release.message);
		noUpdate();
		return;
	}

	state.releaseInfo = release;

	if (!isNewer(latest, app.getVersion())) {
		noUpdate();
		return;
	}

	await presentUpdate(latest);
}

export async function presentUpdate(version) {
	const loader = await whenLoaderReady();
	if (!loader) {
		fallbackOpenRelease();
		return;
	}

	state.presented = true;

	loader.webContents.send("nmc-update:available", {
		version: String(version).replace(/^v/, ""),
		strings: buildStrings(),
	});
}

export function onStart() {
	if (state.started) return;
	state.started = true;
	sendStatus(t("updater.preparing"));

	if (isElectronUpdaterType(state.installType)) {
		getAutoUpdater()
			.downloadUpdate()
			.catch((err) => {
				console.error("[Updater] downloadUpdate failed:", err);
				sendError(err?.message || String(err));
				state.started = false;
			});
		return;
	}

	if (isWindowsInstallerType(state.installType)) {
		runWindowsInstallerUpdate().catch((err) => {
			console.error("[Updater] windows update failed:", err);
			sendError(err?.message || String(err));
			state.started = false;
		});
		return;
	}

	if (isSystemPackageType(state.installType)) {
		runSystemPackageUpdate().catch((err) => {
			console.error("[Updater] system update failed:", err);
			fallbackOpenRelease();
		});
		return;
	}

	fallbackOpenRelease();
}

export function onCancel() {
	if (state.manualMode) {
		closeManualLoader();
	} else {
		resolveGate();
	}
}

export function registerIpc() {
	registerHandlers({
		"nmc-update:start": on(() => onStart()),
		"nmc-update:cancel": on(() => onCancel()),
	});
}

export function buildStrings() {
	return {
		available: t("updater.available"),
		update: t("updater.update"),
		cancel: t("updater.cancel"),
		downloading: t("updater.downloading"),
		preparing: t("updater.preparing"),
		installing: t("updater.installing"),
		restarting: t("updater.restarting"),
		error: t("updater.error"),
	};
}

export function noUpdate() {
	if (state.manualMode) {
		closeManualLoader();
		dialog
			.showMessageBox({
				type: "info",
				title: t("updater.title"),
				message: t("updater.upToDate"),
				buttons: ["OK"],
				noLink: true,
			})
			.catch(() => {});
	} else {
		resolveGate();
	}
}

export function fallbackOpenRelease() {
	shell.openExternal(state.releaseInfo?.html_url || RELEASES_PAGE);
	if (state.manualMode) closeManualLoader();
	else resolveGate();
}

export function resolveGate() {
	if (state.gateResolved) return;
	state.gateResolved = true;
	if (typeof global.__nmcUpdateGateResolve === "function") {
		global.__nmcUpdateGateResolve();
	}
}

export function closeManualLoader() {
	const w = getLoader();
	if (state.createdManualLoader && w) {
		try {
			w.close();
		} catch {}
		global.loaderWindow = null;
		state.createdManualLoader = false;
	}
	state.manualMode = false;
	state.presented = false;
	state.started = false;
}

export function getLoader() {
	const w = global.loaderWindow;
	return w && !w.isDestroyed() ? w : null;
}

export function whenLoaderReady() {
	const w = getLoader();
	if (!w) return Promise.resolve(null);
	if (!w.webContents.isLoading()) return Promise.resolve(w);
	return new Promise((resolve) => {
		w.webContents.once("did-finish-load", () => resolve(getLoader()));
	});
}

export function sendToLoader(channel, payload) {
	const w = getLoader();
	if (w) w.webContents.send(channel, payload);
}

export function sendStatus(text) {
	sendToLoader("nmc-update:status", { text });
}

export function sendError(message) {
	sendToLoader("nmc-update:error", { message });
}
