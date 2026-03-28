import { getPaths, defaultConfig } from "../config.js";
import fs from "fs";

let config;

const CONFIG_EXTRA_KEYS_WHITELIST = new Set(["labs"]);

function reorderConfig(obj, defaultObj, isRoot = true) {
    if (
        typeof defaultObj !== "object" ||
        defaultObj === null ||
        Array.isArray(defaultObj)
    ) {
        return obj ?? defaultObj;
    }

    const result = {};

    for (const key of Object.keys(defaultObj)) {
        if (key in obj) {
            result[key] = reorderConfig(obj[key], defaultObj[key], false);
        } else {
            result[key] = structuredClone(defaultObj[key]);
        }
    }

    // Сохраняем только ключи из белого списка
    if (isRoot) {
        for (const key of Object.keys(obj)) {
            if (!(key in defaultObj) && CONFIG_EXTRA_KEYS_WHITELIST.has(key)) {
                result[key] = obj[key];
            }
        }
    }

    return result;
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
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(defaultConfig, null, 2),
            "utf-8",
        );
        config = structuredClone(defaultConfig);
        return config;
    }

    try {
        const raw = fs.readFileSync(configFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        config = reorderConfig(parsed, defaultConfig);

        // Если порядок или состав изменились — перезаписываем файл
        if (JSON.stringify(parsed) !== JSON.stringify(config)) {
            fs.writeFileSync(
                configFilePath,
                JSON.stringify(config, null, 2),
                "utf-8",
            );
        }
    } catch {
        config = structuredClone(defaultConfig);
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(config, null, 2),
            "utf-8",
        );
    }

    return config;
}

export function getConfig() {
    if (!config) return loadConfig();
    return config;
}

export function saveConfig(newConfig) {
    const { configFilePath } = getPaths();
    config = reorderConfig(newConfig, defaultConfig);

    try {
        fs.writeFileSync(
            configFilePath,
            JSON.stringify(config, null, 2),
            "utf-8",
        );
    } catch (err) {
        console.error("[Config] Failed to save config:", err);
    }
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
