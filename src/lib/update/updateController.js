import { app, ipcMain, shell, dialog } from "electron";
import https from "https";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import electronUpdater from "electron-updater";
import { t } from "../langManager.js";
import { getConfig } from "../configManager.js";
import { createLoaderWindow } from "../window/createLoaderWindow.js";
import {
	detectInstallType,
	isElectronUpdaterType,
	isWindowsInstallerType,
	isSystemPackageType,
} from "./installType.js";

function getAutoUpdater() {
	return electronUpdater.autoUpdater;
}

const GITHUB_LATEST =
	"https://api.github.com/repos/Web-Next-Music/Next-Music-Client/releases/latest";
const RELEASES_PAGE =
	"https://github.com/Web-Next-Music/Next-Music-Client/releases/latest";

const SAFETY_TIMEOUT_MS = 8000;

let installType = "unknown";
let releaseInfo = null;
let presented = false;
let started = false;
let manualMode = false;
let createdManualLoader = false;
let gateResolved = false;
let ipcRegistered = false;

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
		if (!presented) resolveGate();
	}, SAFETY_TIMEOUT_MS);

	runCheck().catch((err) => {
		console.error("[Updater] startup check failed:", err);
		resolveGate();
	});
}

export async function checkForUpdates() {
	if (!app.isPackaged) {
		console.log("[Updater] Skipped manual check in dev build.");
		return;
	}

	manualMode = true;
	gateResolved = true; // no startup gate in manual mode
	presented = false;
	started = false;

	installType = detectInstallType();
	registerIpc();

	let loader = getLoader();
	if (!loader) {
		loader = createLoaderWindow();
		global.loaderWindow = loader;
		createdManualLoader = true;
	}

	try {
		await runCheck();
	} catch (err) {
		console.error("[Updater] manual check failed:", err);
		noUpdate();
	}
}

async function runCheck() {
	installType = detectInstallType();
	console.log("[Updater] install type:", installType);

	if (isElectronUpdaterType(installType)) {
		await runElectronUpdaterCheck();
	} else {
		await runManualCheck();
	}
}

async function runElectronUpdaterCheck() {
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
		started = false;
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

	releaseInfo = { html_url: RELEASES_PAGE };
	await presentUpdate(latest);
}

async function runManualCheck() {
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

	releaseInfo = release;

	if (!isNewer(latest, app.getVersion())) {
		noUpdate();
		return;
	}

	await presentUpdate(latest);
}

async function presentUpdate(version) {
	const loader = await whenLoaderReady();
	if (!loader) {
		fallbackOpenRelease();
		return;
	}

	presented = true;

	loader.webContents.send("nmc-update:available", {
		version: String(version).replace(/^v/, ""),
		strings: buildStrings(),
	});
}

function onStart() {
	if (started) return;
	started = true;
	sendStatus(t("updater.preparing"));

	if (isElectronUpdaterType(installType)) {
		getAutoUpdater()
			.downloadUpdate()
			.catch((err) => {
				console.error("[Updater] downloadUpdate failed:", err);
				sendError(err?.message || String(err));
				started = false;
			});
		return;
	}

	if (isWindowsInstallerType(installType)) {
		runWindowsInstallerUpdate().catch((err) => {
			console.error("[Updater] windows update failed:", err);
			sendError(err?.message || String(err));
			started = false;
		});
		return;
	}

	if (isSystemPackageType(installType)) {
		runSystemPackageUpdate().catch((err) => {
			console.error("[Updater] system update failed:", err);
			fallbackOpenRelease();
		});
		return;
	}

	// mac / unknown
	fallbackOpenRelease();
}

function onCancel() {
	if (manualMode) {
		closeManualLoader();
	} else {
		resolveGate();
	}
}

async function runWindowsInstallerUpdate() {
	const asset = pickAsset(releaseInfo, installType);
	if (!asset?.browser_download_url) {
		fallbackOpenRelease();
		return;
	}

	const dest = path.join(app.getPath("temp"), asset.name);
	await downloadFile(asset.browser_download_url, dest);

	sendStatus(t("updater.installing"));
	global.__nmcQuitting = true;

	// Launch the NSIS installer detached, then quit so it can replace files.
	// The one-click installer closes any running instance and relaunches the
	// app once the update is applied.
	const child = spawn(dest, [], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();

	setTimeout(() => app.quit(), 200);
}

async function runSystemPackageUpdate() {
	const asset = pickAsset(releaseInfo, installType);
	if (!asset?.browser_download_url) {
		fallbackOpenRelease();
		return;
	}

	const dest = path.join(app.getPath("temp"), asset.name);
	await downloadFile(asset.browser_download_url, dest);

	sendStatus(t("updater.installing"));
	await installSystemPackage(dest, installType);

	sendStatus(t("updater.restarting"));
	global.__nmcQuitting = true;

	const installedBin = "/usr/bin/next-music";
	if (fs.existsSync(installedBin)) {
		app.relaunch({ execPath: installedBin });
	} else {
		app.relaunch();
	}
	app.exit(0);
}

function pickAsset(release, type) {
	const assets = release?.assets || [];
	let ext;
	if (type === "nsis") ext = ".exe";
	else if (type === "pacman") ext = ".pkg.tar.zst";
	else ext = ".deb";
	return assets.find((a) => typeof a.name === "string" && a.name.endsWith(ext));
}

function installSystemPackage(file, type) {
	return new Promise((resolve, reject) => {
		let args;
		if (type === "pacman") {
			args = ["pacman", "-U", "--noconfirm", file];
		} else {
			args = [
				"sh",
				"-c",
				`apt-get install -y "${file}" || { dpkg -i "${file}"; apt-get install -f -y; }`,
			];
		}

		const child = spawn("pkexec", args, {
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderr = "";
		child.stderr.on("data", (d) => (stderr += d.toString()));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`pkexec exited ${code}: ${stderr.trim()}`));
		});
	});
}

function downloadFile(url, dest) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		let lastTime = Date.now();
		let lastBytes = 0;

		function request(currentUrl) {
			https
				.get(
					currentUrl,
					{ headers: { "User-Agent": "Next-Music-Updater" } },
					(res) => {
						if (
							res.statusCode >= 300 &&
							res.statusCode < 400 &&
							res.headers.location
						) {
							res.resume();
							request(res.headers.location);
							return;
						}

						if (res.statusCode !== 200) {
							res.resume();
							reject(new Error(`HTTP ${res.statusCode}`));
							return;
						}

						const total = Number(res.headers["content-length"]) || 0;
						let transferred = 0;

						res.on("data", (chunk) => {
							transferred += chunk.length;
							const now = Date.now();
							const dt = (now - lastTime) / 1000;
							if (dt >= 0.25) {
								sendToLoader("nmc-update:progress", {
									percent: total ? (transferred / total) * 100 : 0,
									transferred,
									total,
									bytesPerSecond: (transferred - lastBytes) / dt,
								});
								lastTime = now;
								lastBytes = transferred;
							}
						});

						res.pipe(file);
						file.on("finish", () => {
							sendToLoader("nmc-update:progress", {
								percent: 100,
								transferred,
								total,
								bytesPerSecond: 0,
							});
							file.close(() => resolve());
						});
					},
				)
				.on("error", (err) => {
					fs.unlink(dest, () => reject(err));
				});
		}

		file.on("error", (err) => {
			fs.unlink(dest, () => reject(err));
		});

		request(url);
	});
}

function registerIpc() {
	if (ipcRegistered) return;
	ipcRegistered = true;
	ipcMain.on("nmc-update:start", () => onStart());
	ipcMain.on("nmc-update:cancel", () => onCancel());
}

function buildStrings() {
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

function noUpdate() {
	if (manualMode) {
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

function fallbackOpenRelease() {
	shell.openExternal(releaseInfo?.html_url || RELEASES_PAGE);
	if (manualMode) closeManualLoader();
	else resolveGate();
}

function resolveGate() {
	if (gateResolved) return;
	gateResolved = true;
	if (typeof global.__nmcUpdateGateResolve === "function") {
		global.__nmcUpdateGateResolve();
	}
}

function closeManualLoader() {
	const w = getLoader();
	if (createdManualLoader && w) {
		try {
			w.close();
		} catch {}
		global.loaderWindow = null;
		createdManualLoader = false;
	}
	manualMode = false;
	presented = false;
	started = false;
}

function getLoader() {
	const w = global.loaderWindow;
	return w && !w.isDestroyed() ? w : null;
}

function whenLoaderReady() {
	const w = getLoader();
	if (!w) return Promise.resolve(null);
	if (!w.webContents.isLoading()) return Promise.resolve(w);
	return new Promise((resolve) => {
		w.webContents.once("did-finish-load", () => resolve(getLoader()));
	});
}

function sendToLoader(channel, payload) {
	const w = getLoader();
	if (w) w.webContents.send(channel, payload);
}

function sendStatus(text) {
	sendToLoader("nmc-update:status", { text });
}

function sendError(message) {
	sendToLoader("nmc-update:error", { message });
}

function getGitHubToken() {
	try {
		const token = getConfig()?.github?.accessToken;
		return typeof token === "string" && token.trim() ? token.trim() : null;
	} catch {
		return null;
	}
}

async function fetchLatestRelease() {
	const token = getGitHubToken();
	if (token) {
		try {
			return await getJson(GITHUB_LATEST, token);
		} catch (err) {
			console.warn(
				`[Updater] Authenticated GitHub request failed (${err.message}); retrying anonymously.`,
			);
		}
	}
	return getJson(GITHUB_LATEST);
}

function getJson(url, token) {
	return new Promise((resolve, reject) => {
		const headers = {
			"User-Agent": "Next-Music-Updater",
			Accept: "application/vnd.github+json",
		};
		if (token) headers.Authorization = `Bearer ${token}`;

		https
			.get(url, { headers }, (res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					const status = res.statusCode || 0;
					if (status < 200 || status >= 300) {
						reject(new Error(`HTTP ${status}`));
						return;
					}
					try {
						resolve(JSON.parse(data));
					} catch (err) {
						reject(err);
					}
				});
			})
			.on("error", reject);
	});
}

function isNewer(latestRaw, currentRaw) {
	const latest = parseVersion(normalizeVersion(latestRaw));
	const current = parseVersion(normalizeVersion(currentRaw));

	if (!latest || !current) return false;

	for (let i = 0; i < 3; i++) {
		if (latest.base[i] > current.base[i]) return true;
		if (latest.base[i] < current.base[i]) return false;
	}

	if (latest.beta === null && current.beta === null) return false;
	if (latest.beta === null) return true; // stable > beta
	if (current.beta === null) return false; // beta < stable
	return latest.beta > current.beta;
}

function normalizeVersion(v) {
	return String(v ?? "")
		.trim()
		.replace(/^v/, "");
}

function parseVersion(v) {
	const beta = v.match(/^(\d+)\.(\d+)\.(\d+)-beta[.-]?(\d+)?$/);
	if (beta) {
		return {
			base: [Number(beta[1]), Number(beta[2]), Number(beta[3])],
			beta: Number(beta[4] ?? 0),
		};
	}
	const stable = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (stable) {
		return {
			base: [Number(stable[1]), Number(stable[2]), Number(stable[3])],
			beta: null,
		};
	}
	return null;
}
