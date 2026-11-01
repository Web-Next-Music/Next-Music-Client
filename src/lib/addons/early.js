import fs from "fs";
import path from "path";

import { ipcMain } from "electron";
import { getPaths } from "../../config.js";
import { getConfig } from "../configManager.js";
import { getAddonExperimentOverrides } from "../experiments/addonExperiments.js";
import {
	startAssetServer,
	FETCH_TIMEOUT_MS,
	ADDON_DIRS,
} from "./assetServer.js";
import { scanAddonCssFiles, relativeAddonPath } from "./cssScanner.js";
import { buildEarlyAddonsScript } from "./earlyBootstrap.js";
import { buildDocumentStartScript } from "./documentStartBootstrap.js";
import { enterDirectory, statDirent } from "./fsUtils.js";
import {
	ADDON_SCRIPT_EXTENSIONS,
	isTypeDeclaration,
	isEarlyAddonScript,
	scriptExtension,
	transpileAddonScript,
	loadSucrase,
} from "./transpile.js";
import {
	setActiveAddonsWindow,
	startAddonCssLiveUpdates,
	resetAddonCssSnapshot,
} from "./cssLiveReload.js";

let sucrase;
const handlers = new Map();
const { addonsDirectory } = getPaths();
const CHANNEL = "nmc:early-addons";
const DOCUMENT_START_CHANNEL = "nmc:document-start-addons";
const documentStartHandlers = new Map();

function isMusicUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "music.yandex.ru";
	} catch {
		return false;
	}
}

function scanScripts(directory, result = [], ancestors = new Set()) {
	const visited = enterDirectory(directory, ancestors);
	if (!visited) return result;
	let entries;
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (err) {
		if (err.code !== "ENOENT")
			console.warn(
				`[Addons] Cannot read directory '${directory}':`,
				err.message,
			);
		return result;
	}
	for (const entry of entries) {
		const info = statDirent(directory, entry);
		if (!info) continue;
		if (info.isDirectory) {
			if (
				entry.name.startsWith("!") ||
				["node_modules", ".git", "assets"].includes(entry.name)
			)
				continue;
			if (directory === addonsDirectory)
				ADDON_DIRS.set(entry.name, info.fullPath);
			scanScripts(info.fullPath, result, visited);
		} else if (
			info.isFile &&
			ADDON_SCRIPT_EXTENSIONS.includes(scriptExtension(entry.name)) &&
			!isTypeDeclaration(entry.name)
		) {
			result.push(info.fullPath);
		}
	}
	return result;
}

function prepareLocalAddons() {
	const empty = {
		regularCss: [],
		regularJs: [],
		experimentCss: [],
		experimentJs: [],
		waitForExperiments: false,
	};
	if (!getConfig()?.programSettings?.addons?.enable) return empty;
	const experimentNames = new Set(
		getAddonExperimentOverrides().map((item) => item.addonName),
	);
	empty.waitForExperiments = experimentNames.size > 0;
	const isExperiment = (file) =>
		experimentNames.has(
			path.relative(addonsDirectory, file).split(path.sep)[0],
		);
	const snapshot = scanAddonCssFiles();
	resetAddonCssSnapshot(snapshot);
	for (const [file, data] of snapshot) {
		empty[isExperiment(file) ? "experimentCss" : "regularCss"].push({
			label: data.label,
			content: data.content,
		});
	}
	const best = new Map();
	for (const file of scanScripts(addonsDirectory)) {
		if (isEarlyAddonScript(file)) continue;
		const ext = scriptExtension(file);
		const key = file.slice(0, -ext.length);
		const previous = best.get(key);
		if (
			!previous ||
			ADDON_SCRIPT_EXTENSIONS.indexOf(ext) <
				ADDON_SCRIPT_EXTENSIONS.indexOf(scriptExtension(previous))
		)
			best.set(key, file);
	}
	for (const file of [...best.values()].sort((a, b) =>
		relativeAddonPath(a).localeCompare(relativeAddonPath(b)),
	)) {
		const label = relativeAddonPath(file);
		try {
			let content = fs.readFileSync(file, "utf8");
			const ext = scriptExtension(file);
			if (ext !== ".js") {
				const transforms =
					ext === ".tsx"
						? ["typescript", "jsx"]
						: ext === ".ts"
							? ["typescript"]
							: ["jsx"];
				content = sucrase.transform(content, {
					transforms,
					jsxRuntime: "classic",
					jsxPragma: "React.createElement",
					jsxFragmentPragma: "React.Fragment",
					production: true,
					filePath: file,
				}).code;
			}
			empty[isExperiment(file) ? "experimentJs" : "regularJs"].push({
				label,
				content,
			});
		} catch (err) {
			console.error(`[Addons] Cannot prepare '${label}':`, err.message);
		}
	}
	return empty;
}

async function prepareEarlyAddons() {
	const result = { onlineCss: [], onlineJs: [] };
	if (!getConfig()?.programSettings?.addons?.enable) return result;
	const urls = getConfig()?.programSettings?.addons?.onlineScripts ?? [];
	const prepared = await Promise.all(
		urls.map(async (url) => {
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				});
				if (!response.ok)
					throw new Error(`HTTP ${response.status} ${response.statusText}`);
				const content = await response.text();
				let pathname = url;
				try {
					pathname = new URL(url).pathname;
				} catch {}
				if (ADDON_SCRIPT_EXTENSIONS.includes(scriptExtension(pathname))) {
					const code = await transpileAddonScript(content, pathname, url);
					return code === null
						? null
						: { type: "onlineJs", label: url, content: code };
				}
				if (pathname.endsWith(".css"))
					return { type: "onlineCss", label: url, content };
				console.warn(`[Addons] Unknown file type for online addon: ${url}`);
			} catch (err) {
				console.error(
					`[Addons] Failed to load online addon '${url}':`,
					err.message,
				);
			}
			return null;
		}),
	);
	for (const item of prepared) {
		if (item)
			result[item.type].push({ label: item.label, content: item.content });
	}
	return result;
}

async function prepareDocumentStartAddons() {
	if (!getConfig()?.programSettings?.addons?.enable) return null;
	const best = new Map();
	for (const file of scanScripts(addonsDirectory).filter(isEarlyAddonScript)) {
		const ext = scriptExtension(file);
		const key = file.slice(0, -ext.length);
		const previous = best.get(key);
		if (
			!previous ||
			ADDON_SCRIPT_EXTENSIONS.indexOf(ext) <
				ADDON_SCRIPT_EXTENSIONS.indexOf(scriptExtension(previous))
		)
			best.set(key, file);
	}
	const scripts = [];
	for (const file of [...best.values()].sort((a, b) =>
		relativeAddonPath(a).localeCompare(relativeAddonPath(b)),
	)) {
		const label = relativeAddonPath(file);
		try {
			const content = await transpileAddonScript(
				fs.readFileSync(file, "utf8"),
				file,
				label,
			);
			if (content !== null) scripts.push({ label, content });
		} catch (err) {
			console.error(`[Addons] Cannot prepare '${label}':`, err.message);
		}
	}
	return buildDocumentStartScript(scripts);
}

async function registerEarlyAddons(window) {
	const webContents = window.webContents;
	let online = null;
	let documentStartScript = null;
	documentStartHandlers.set(webContents, (event) => {
		if (
			event.senderFrame !== webContents.mainFrame ||
			!isMusicUrl(event.senderFrame.url) ||
			!getConfig()?.programSettings?.addons?.enable
		) {
			event.returnValue = null;
			return;
		}
		event.returnValue = documentStartScript;
	});
	if (!ipcMain.listenerCount(DOCUMENT_START_CHANNEL)) {
		ipcMain.on(DOCUMENT_START_CHANNEL, (event) => {
			const handler = documentStartHandlers.get(event.sender);
			if (handler) handler(event);
			else event.returnValue = null;
		});
	}
	setActiveAddonsWindow(window);
	const handler = (event) => {
		if (
			event.senderFrame !== webContents.mainFrame ||
			!isMusicUrl(event.senderFrame.url)
		) {
			event.returnValue = null;
			return;
		}
		if (!online) {
			console.error(
				"[Addons] Navigation started before early addon preparation finished",
			);
			event.returnValue = null;
			return;
		}
		try {
			const local = prepareLocalAddons();
			const enabled = getConfig()?.programSettings?.addons?.enable;
			event.returnValue = buildEarlyAddonsScript({
				...local,
				...(enabled ? online : { onlineCss: [], onlineJs: [] }),
			});
		} catch (err) {
			console.error("[Addons] Early preparation failed:", err);
			event.returnValue = null;
		}
	};
	handlers.set(webContents, handler);
	if (!ipcMain.listenerCount(CHANNEL)) {
		ipcMain.on(CHANNEL, (event) => {
			const activeHandler = handlers.get(event.sender);
			if (activeHandler) activeHandler(event);
			else event.returnValue = null;
		});
	}
	window.once("closed", () => {
		handlers.delete(webContents);
		documentStartHandlers.delete(webContents);
	});
	const documentStartPreparation = prepareDocumentStartAddons()
		.then((script) => {
			documentStartScript = script;
		})
		.catch((err) =>
			console.error("[Addons] Document-start preparation failed:", err),
		);
	if (getConfig()?.programSettings?.addons?.enable) {
		startAddonCssLiveUpdates();
		const [, prepared, compiler] = await Promise.all([
			startAssetServer().catch((err) =>
				console.error("[Addons] Asset server failed:", err),
			),
			prepareEarlyAddons(),
			loadSucrase().catch((err) => {
				console.error("[Addons] Cannot load transpiler:", err);
				return null;
			}),
		]);
		sucrase = compiler;
		online = prepared;
	} else {
		online = { onlineCss: [], onlineJs: [] };
	}
	await documentStartPreparation;
}

export { prepareEarlyAddons, registerEarlyAddons };
