"use strict";

import { app } from "electron";
import fs from "fs";
import path from "path";
import { getBuiltinExperimentState } from "./lib/experiments/builtinExperiments.js";
import { parseLuaConfig } from "./lib/luaConfig.js";

export const isDev = !app.isPackaged;
export const devUrl = "http://localhost:6788";
export const APPNAME = `next-music`;

app.setName(APPNAME);

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getAppIcon(userExperiments = {}) {
	return getBuiltinExperimentState("nm_condemned_mode", userExperiments) ===
		"on"
		? path.join(__dirname, "assets/nm-icons/icon-256-condemned.png")
		: path.join(__dirname, "assets/nm-icons/icon-256.png");
}

export function getTrayIconPath(userExperiments = {}) {
	return getBuiltinExperimentState("nm_condemned_mode", userExperiments) ===
		"on"
		? path.join(__dirname, "assets/nm-icons/nm-tray-condemned.png")
		: path.join(__dirname, "assets/nm-icons/nm-tray.png");
}

export const SECRET_KEYS = ["github", "discord"];

const DEFAULT_CONFIG_FILE = path.join(__dirname, "defaultConfig.lua");

const ARRAY_PATHS = new Set(["programSettings.addons.onlineScripts"]);

function normalizeTables(value, keyPath = "") {
	if (Array.isArray(value)) {
		if (value.length === 0 && !ARRAY_PATHS.has(keyPath)) return {};
		return value.map((item) => normalizeTables(item, keyPath));
	}

	if (value && typeof value === "object") {
		const result = {};

		for (const key of Object.keys(value)) {
			result[key] = normalizeTables(
				value[key],
				keyPath ? `${keyPath}.${key}` : key,
			);
		}

		return result;
	}

	return value;
}

function loadDefaultConfig() {
	const raw = fs.readFileSync(DEFAULT_CONFIG_FILE, "utf-8");
	const { config, secrets } = parseLuaConfig(raw);

	return normalizeTables({ ...config, ...secrets });
}

export const defaultConfig = loadDefaultConfig();

export function getPaths() {
	const userData = app.getPath("userData");

	return {
		nextMusicDirectory: userData,
		addonsDirectory: path.join(userData, "Addons"),
		languagesDirectory: path.join(userData, "Languages"),
		configFilePath: path.join(userData, "Config.lua"),
		legacyConfigFilePath: path.join(userData, "Config.json"),
	};
}
