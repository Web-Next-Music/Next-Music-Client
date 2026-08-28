import { getPaths } from "../../config.js";
import { getConfig } from "../configManager.js";
import { getAddonExperimentOverrides } from "../experiments/addonExperiments.js";
import path from "path";
import { startAssetServer, FETCH_TIMEOUT_MS } from "./assetServer.js";
import {
	loadFilesFromDirectory,
	relativeAddonPath,
	scanAddonCssFiles,
} from "./cssScanner.js";
import {
	setActiveAddonsWindow,
	execAddonScript,
	applyCssSnapshot,
	startAddonCssLiveUpdates,
	addonCssCache,
	addonCssMeta,
} from "./cssLiveReload.js";
import {
	ADDON_SCRIPT_EXTENSIONS,
	scriptExtension,
	transpileAddonScript,
} from "./transpile.js";
import { syncAddonTypings } from "./typings.js";

const { addonsDirectory } = getPaths();

const EXPERIMENTS_WAIT_TIMEOUT_MS = 20_000;
const EXPERIMENTS_POLL_MS = 50;

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
		return await res.text();
	} finally {
		clearTimeout(timer);
	}
}

async function waitForExperimentsApplied(webContents) {
	const deadline = Date.now() + EXPERIMENTS_WAIT_TIMEOUT_MS;

	while (Date.now() < deadline) {
		try {
			if (
				await webContents.executeJavaScript(
					"!!window.__nmcExperimentsDone",
				)
			)
				return;
		} catch {}
		await new Promise((r) => setTimeout(r, EXPERIMENTS_POLL_MS));
	}

	console.warn(
		"[Addons] Experiments wait timed out, loading experiment addons anyway",
	);
}

function addonNameFromPath(filePath) {
	return path.relative(addonsDirectory, filePath).split(path.sep)[0];
}

function scriptPriority(filePath) {
	return ADDON_SCRIPT_EXTENSIONS.indexOf(scriptExtension(filePath));
}

function dedupeAddonScripts(scripts) {
	const best = new Map();

	for (const script of scripts) {
		const key = script.filePath.slice(
			0,
			-scriptExtension(script.filePath).length,
		);
		const current = best.get(key);

		if (
			!current ||
			scriptPriority(script.filePath) < scriptPriority(current.filePath)
		) {
			if (current) {
				console.log(
					`Skip JS: ${relativeAddonPath(current.filePath)} (shadowed by ${relativeAddonPath(script.filePath)})`,
				);
			}
			best.set(key, script);
		} else {
			console.log(
				`Skip JS: ${relativeAddonPath(script.filePath)} (shadowed by ${relativeAddonPath(current.filePath)})`,
			);
		}
	}

	return [...best.values()].sort((a, b) =>
		relativeAddonPath(a.filePath).localeCompare(
			relativeAddonPath(b.filePath),
		),
	);
}

async function execAddonScriptFile(execJS, { jsContent, filePath }, suffix) {
	const label = relativeAddonPath(filePath);
	const code = await transpileAddonScript(jsContent, filePath, label);

	if (code === null) return;

	console.log(`Load JS${suffix}: ${label}`);
	await execJS(code, label);
}

async function applyAddons(mainWindow) {
	const config = getConfig();

	if (!config.programSettings.addons.enable) {
		console.log("Addons are disabled");
		return;
	}

	if (!mainWindow) {
		console.error(
			"[Addons] mainWindow is not provided - aborting applyAddons",
		);
		return;
	}

	console.log("Loading addons…");
	setActiveAddonsWindow(mainWindow);
	syncAddonTypings();

	await startAssetServer();
	startAddonCssLiveUpdates();

	async function execJS(script, label) {
		await execAddonScript(script, label);
	}

	const experimentAddonNames = new Set(
		getAddonExperimentOverrides().map((o) => o.addonName),
	);

	const cssSnapshot = scanAddonCssFiles();
	addonCssCache.clear();
	addonCssMeta.clear();

	const regularCss = new Map();
	const experimentCss = new Map();

	for (const [filePath, data] of cssSnapshot) {
		addonCssCache.set(filePath, data.content);
		addonCssMeta.set(filePath, data.signature);
		const target = experimentAddonNames.has(addonNameFromPath(filePath))
			? experimentCss
			: regularCss;
		target.set(filePath, data);
	}

	const regularJs = [];
	const experimentJs = [];

	await loadFilesFromDirectory(
		addonsDirectory,
		ADDON_SCRIPT_EXTENSIONS,
		(jsContent, filePath) => {
			const target = experimentAddonNames.has(addonNameFromPath(filePath))
				? experimentJs
				: regularJs;
			target.push({ jsContent, filePath });
		},
	);

	await applyCssSnapshot(regularCss);

	for (const script of dedupeAddonScripts(regularJs)) {
		await execAddonScriptFile(execJS, script, "");
	}

	if (experimentAddonNames.size > 0) {
		await waitForExperimentsApplied(mainWindow.webContents);

		await applyCssSnapshot(experimentCss);

		for (const script of dedupeAddonScripts(experimentJs)) {
			await execAddonScriptFile(execJS, script, " (after experiments)");
		}
	}

	const onlineAddons = config.programSettings.addons.onlineScripts ?? [];

	await Promise.allSettled(
		onlineAddons.map(async (url) => {
			console.log(`Loading online addon: ${url}`);
			let content;

			try {
				content = await fetchWithTimeout(url);
			} catch (err) {
				console.error(
					`[Addons] Failed to fetch '${url}':`,
					err.message,
				);
				return;
			}

			let pathname = url;

			try {
				pathname = new URL(url).pathname;
			} catch {}

			if (ADDON_SCRIPT_EXTENSIONS.includes(scriptExtension(pathname))) {
				const code = await transpileAddonScript(content, pathname, url);
				if (code !== null) await execJS(code, url);
			} else if (pathname.endsWith(".css")) {
				await execJS(
					`(() => {
						const key = ${JSON.stringify(url)};
						const css = ${JSON.stringify(content)};
						const selector = \`style[data-nmc-online-addon-css="\${CSS.escape(key)}"]\`;
						let style = document.querySelector(selector);

						if (!style) {
							style = document.createElement("style");
							style.dataset.nmcOnlineAddonCss = key;
							document.head.appendChild(style);
						}

						style.textContent = css;
					})();`,
					url,
				);
			} else {
				console.warn(
					`[Addons] Unknown file type for online addon: ${url}`,
				);
			}
		}),
	);

	console.log("Addons loaded.");
}

export {
	fetchWithTimeout,
	waitForExperimentsApplied,
	addonNameFromPath,
	applyAddons,
};
