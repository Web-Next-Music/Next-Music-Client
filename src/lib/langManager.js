"use strict";
const fs = require("fs");
const path = require("path");

// Папка с языками в исходниках проекта (корень/lang)
const BUNDLED_LANG_DIR = path.join(__dirname, "../lang");

let currentLang = {};
let currentLangCode = "en";

function copyBundledLanguages(languagesDirectory) {
    if (!fs.existsSync(languagesDirectory)) {
        fs.mkdirSync(languagesDirectory, { recursive: true });
    }
    if (!fs.existsSync(BUNDLED_LANG_DIR)) {
        console.warn(
            "[Lang] Bundled lang directory not found:",
            BUNDLED_LANG_DIR,
        );
        return;
    }
    const files = fs
        .readdirSync(BUNDLED_LANG_DIR)
        .filter((f) => f.endsWith(".json"));
    for (const file of files) {
        const src = path.join(BUNDLED_LANG_DIR, file);
        const dest = path.join(languagesDirectory, file);
        if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            console.log("[Lang] Copied language file:", file);
        } else {
            const srcContent = fs.readFileSync(src);
            const destContent = fs.readFileSync(dest);
            if (!srcContent.equals(destContent)) {
                fs.copyFileSync(src, dest);
                console.log(
                    "[Lang] Updated language file (content mismatch):",
                    file,
                );
            }
        }
    }
}

function getAvailableLanguages(languagesDirectory) {
    if (!fs.existsSync(languagesDirectory)) return [];
    return fs
        .readdirSync(languagesDirectory)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.basename(f, ".json"));
}

function loadLanguage(languagesDirectory, langCode) {
    const filePath = path.join(languagesDirectory, `${langCode}.json`);
    if (fs.existsSync(filePath)) {
        try {
            const raw = fs.readFileSync(filePath, "utf-8");
            currentLang = JSON.parse(raw);
            currentLangCode = langCode;
            console.log("[Lang] Loaded language:", langCode);
            return true;
        } catch (err) {
            console.error(
                "[Lang] Failed to parse language file:",
                filePath,
                err,
            );
        }
    }
    // Фоллбэк на en
    if (langCode !== "en") {
        console.warn(
            `[Lang] Language "${langCode}" not found, falling back to "en"`,
        );
        return loadLanguage(languagesDirectory, "en");
    }
    // Совсем пусто
    currentLang = {};
    currentLangCode = "en";
    return false;
}

function initLanguages(languagesDirectory, langCode = "en") {
    copyBundledLanguages(languagesDirectory);
    loadLanguage(languagesDirectory, langCode);
}

function t(key, vars = {}) {
    const parts = key.split(".");
    let value = currentLang;
    for (const part of parts) {
        if (value && typeof value === "object" && part in value) {
            value = value[part];
        } else {
            // Ключ не найден — возвращаем сам ключ как фоллбэк
            return key;
        }
    }
    if (typeof value !== "string") return key;
    // Подставляем переменные: {version} → vars.version
    return value.replace(/\{(\w+)\}/g, (_, k) =>
        k in vars ? vars[k] : `{${k}}`,
    );
}

function getCurrentLangCode() {
    return currentLangCode;
}

function _flatten(obj, prefix, out = {}) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            _flatten(v, key, out);
        } else if (typeof v === "string") {
            out[key] = v;
        }
    }
    return out;
}

function getAllStrings() {
    return _flatten(currentLang, "");
}

module.exports = {
    initLanguages,
    loadLanguage,
    getAvailableLanguages,
    copyBundledLanguages,
    getCurrentLangCode,
    getAllStrings,
    t,
};
