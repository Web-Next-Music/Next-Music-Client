import fs from "fs";
import { getConfig } from "../configManager.js";
import { fileSignature } from "./fsUtils.js";
import {
	relativeAddonPath,
	scanAddonCssMeta,
	scanAddonCssDirectories,
} from "./cssScanner.js";

let activeAddonsWindow = null;
let cssWatcherStarted = false;
let cssRescanTimer = null;
let cssPollingTimer = null;
let cssRescanInProgress = false;
const cssWatchers = new Map();
const addonCssCache = new Map();
const addonCssMeta = new Map();
const pendingCssRemovals = new Map();
const CSS_RESCAN_DELAY_MS = 100;
const CSS_POLL_INTERVAL_MS = 1000;
const CSS_REMOVAL_GRACE_MS = 2500;

function setActiveAddonsWindow(window) {
	activeAddonsWindow = window;
}

function cssInjectionScript(filePath, cssContent) {
	return `(() => {
		const key = ${JSON.stringify(relativeAddonPath(filePath))};
		const css = ${JSON.stringify(cssContent)};
		const selector = \`style[data-nmc-addon-css="\${CSS.escape(key)}"]\`;
		let style = document.querySelector(selector);

		if (!style) {
			style = document.createElement("style");
			style.dataset.nmcAddonCss = key;
			document.head.appendChild(style);
		}

		if (style.textContent !== css) {
			style.textContent = css;
		}
	})();`;
}

function cssRemovalScript(filePath) {
	return `(() => {
		const key = ${JSON.stringify(relativeAddonPath(filePath))};
		document
			.querySelectorAll(\`style[data-nmc-addon-css="\${CSS.escape(key)}"]\`)
			.forEach((style) => style.remove());
	})();`;
}

async function execAddonScript(script, label) {
	if (!activeAddonsWindow || activeAddonsWindow.isDestroyed()) return;
	if (!activeAddonsWindow.webContents.getURL().includes("music.yandex.ru"))
		return;

	try {
		await activeAddonsWindow.webContents.executeJavaScript(
			`(() => {
				if (!location.host.includes("music.yandex.ru")) return;
				return (() => {${script}})();
			})()`,
		);
	} catch (err) {
		console.error(`[Addons] executeJavaScript failed for '${label}':`, err);
	}
}

async function applyCssSnapshot(cssSnapshot) {
	for (const [filePath, { content, label }] of cssSnapshot) {
		await execAddonScript(cssInjectionScript(filePath, content), label);
	}
}

async function rescanAddonCss() {
	if (!getConfig().programSettings.addons.enable) return;
	if (cssRescanInProgress) return;

	cssRescanInProgress = true;

	try {
		let nextSnapshot;
		try {
			nextSnapshot = scanAddonCssMeta();
		} catch (err) {
			console.error("[Addons] CSS rescan failed:", err);
			return;
		}

		for (const [filePath, { signature, label }] of nextSnapshot) {
			const pendingRemoval = pendingCssRemovals.get(filePath);
			if (pendingRemoval) {
				clearTimeout(pendingRemoval);
				pendingCssRemovals.delete(filePath);
			}

			if (
				addonCssMeta.get(filePath) === signature &&
				addonCssCache.has(filePath)
			)
				continue;

			let content;
			try {
				content = fs.readFileSync(filePath, "utf8");
			} catch (err) {
				console.warn(
					`[Addons] Cannot read CSS file '${filePath}':`,
					err.message,
				);
				continue;
			}

			addonCssMeta.set(filePath, signature);

			if (addonCssCache.get(filePath) === content) continue;

			addonCssCache.set(filePath, content);
			console.log(`Update CSS: ${label}`);
			await execAddonScript(cssInjectionScript(filePath, content), label);
		}

		for (const filePath of [...addonCssCache.keys()]) {
			if (nextSnapshot.has(filePath)) continue;
			if (pendingCssRemovals.has(filePath)) continue;

			const label = relativeAddonPath(filePath);
			const timer = setTimeout(() => {
				pendingCssRemovals.delete(filePath);

				if (fs.existsSync(filePath)) {
					scheduleAddonCssRescan();
					return;
				}

				addonCssCache.delete(filePath);
				addonCssMeta.delete(filePath);
				console.log(`Remove CSS: ${label}`);
				execAddonScript(cssRemovalScript(filePath), label);
			}, CSS_REMOVAL_GRACE_MS);

			timer.unref?.();
			pendingCssRemovals.set(filePath, timer);
		}

		refreshAddonCssWatchers();
	} finally {
		cssRescanInProgress = false;
	}
}

function scheduleAddonCssRescan() {
	clearTimeout(cssRescanTimer);
	cssRescanTimer = setTimeout(() => {
		rescanAddonCss().catch((err) =>
			console.error("[Addons] CSS live update failed:", err),
		);
	}, CSS_RESCAN_DELAY_MS);
}

function refreshAddonCssWatchers() {
	const directories = scanAddonCssDirectories();

	for (const [directory, watcher] of cssWatchers) {
		if (directories.has(directory)) continue;

		watcher.close();
		cssWatchers.delete(directory);
	}

	for (const directory of directories) {
		if (cssWatchers.has(directory)) continue;

		try {
			const watcher = fs.watch(directory, scheduleAddonCssRescan);
			cssWatchers.set(directory, watcher);
		} catch (err) {
			console.warn(
				`[Addons] Cannot watch CSS directory '${directory}':`,
				err.message,
			);
		}
	}
}

function startAddonCssLiveUpdates() {
	if (cssWatcherStarted) return;

	cssWatcherStarted = true;
	refreshAddonCssWatchers();
	cssPollingTimer = setInterval(scheduleAddonCssRescan, CSS_POLL_INTERVAL_MS);
	cssPollingTimer.unref?.();
	console.log("[Addons] CSS live updates enabled.");
}

export {
	setActiveAddonsWindow,
	cssInjectionScript,
	cssRemovalScript,
	execAddonScript,
	applyCssSnapshot,
	rescanAddonCss,
	scheduleAddonCssRescan,
	refreshAddonCssWatchers,
	startAddonCssLiveUpdates,
	addonCssCache,
	addonCssMeta,
};
