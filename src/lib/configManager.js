import { getPaths, defaultConfig, SECRET_KEYS } from "../config.js";
import { parseLuaConfig, stringifyLuaConfig } from "./luaConfig.js";
import { validateConfig } from "./config/schema.js";
import fs from "fs";

let config;

const CONFIG_EXTRA_KEYS_WHITELIST = new Set(["labs"]);

function reorderConfig(obj, defaultObj, isRoot = true) {
	if (
		typeof defaultObj !== "object" ||
		defaultObj === null ||
		Array.isArray(defaultObj)
	) {
		if (Array.isArray(defaultObj)) {
			if (Array.isArray(obj)) return obj;
			if (obj && typeof obj === "object" && Object.keys(obj).length === 0)
				return [];
			return obj ?? structuredClone(defaultObj);
		}

		return obj ?? defaultObj;
	}

	// Empty plain-object default = dynamic dict (e.g. experiments) - pass through as-is
	if (!isRoot && Object.keys(defaultObj).length === 0) {
		if (typeof obj === "object" && obj !== null && !Array.isArray(obj))
			return obj;
		return {};
	}

	const result = {};

	for (const key of Object.keys(defaultObj)) {
		if (obj && typeof obj === "object" && key in obj) {
			result[key] = reorderConfig(obj[key], defaultObj[key], false);
		} else {
			result[key] = structuredClone(defaultObj[key]);
		}
	}

	if (isRoot && obj && typeof obj === "object") {
		for (const key of Object.keys(obj)) {
			if (!(key in defaultObj) && CONFIG_EXTRA_KEYS_WHITELIST.has(key)) {
				result[key] = obj[key];
			}
		}
	}

	return result;
}

function splitConfig(fullConfig) {
	const settings = {};
	const secrets = {};

	for (const key of Object.keys(fullConfig)) {
		if (SECRET_KEYS.includes(key)) secrets[key] = fullConfig[key];
		else settings[key] = fullConfig[key];
	}

	for (const key of SECRET_KEYS) {
		if (!(key in secrets))
			secrets[key] = structuredClone(defaultConfig[key]);
	}

	return { settings, secrets };
}

function writeLuaConfig(fullConfig) {
	const { configFilePath } = getPaths();
	const { settings, secrets } = splitConfig(fullConfig);

	fs.writeFileSync(
		configFilePath,
		stringifyLuaConfig(settings, secrets),
		"utf-8",
	);
}

function readLegacyConfig() {
	const { legacyConfigFilePath } = getPaths();

	if (!fs.existsSync(legacyConfigFilePath)) return null;

	try {
		return JSON.parse(fs.readFileSync(legacyConfigFilePath, "utf-8"));
	} catch (err) {
		console.error("[Config] Failed to read legacy config:", err);
		return null;
	}
}

export function loadConfig() {
	const {
		nextMusicDirectory,
		addonsDirectory,
		languagesDirectory,
		configFilePath,
	} = getPaths();

	if (!fs.existsSync(nextMusicDirectory))
		fs.mkdirSync(nextMusicDirectory, { recursive: true });

	if (!fs.existsSync(addonsDirectory))
		fs.mkdirSync(addonsDirectory, { recursive: true });

	if (!fs.existsSync(languagesDirectory))
		fs.mkdirSync(languagesDirectory, { recursive: true });

	if (!fs.existsSync(configFilePath)) {
		const legacy = readLegacyConfig();

		config = reorderConfig(legacy ?? defaultConfig, defaultConfig);

		if (legacy) console.log("[Config] Migrated Config.json to Config.lua");

		writeLuaConfig(config);
		return config;
	}

	try {
		const raw = fs.readFileSync(configFilePath, "utf-8");
		const { config: settings, secrets } = parseLuaConfig(raw);
		const merged = { ...settings, ...secrets };

		config = reorderConfig(merged, defaultConfig);
		validateConfig(config);

		if (JSON.stringify(merged) !== JSON.stringify(config))
			writeLuaConfig(config);
	} catch (err) {
		console.error("[Config] Failed to read Config.lua:", err);

		config = structuredClone(defaultConfig);
		writeLuaConfig(config);
	}

	return config;
}

export function getConfig() {
	if (!config) return loadConfig();
	return config;
}

export function saveConfig(newConfig) {
	config = reorderConfig(newConfig, defaultConfig);
	validateConfig(config);

	try {
		writeLuaConfig(config);
	} catch (err) {
		console.error("[Config] Failed to save config:", err);
	}
}

export function patchConfig(mutator) {
	const cfg = getConfig();
	mutator(cfg);
	saveConfig(cfg);
	return cfg;
}

export function setLanguage(langCode) {
	const cfg = getConfig();
	if (!cfg.programSettings) cfg.programSettings = {};
	cfg.programSettings.language = langCode;
	saveConfig(cfg);
}

export function updateConfig(newConfig) {
	saveConfig(newConfig);
}
