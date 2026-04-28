import "./style.scss";

const require = globalThis.require;

if (!require) {
	throw new Error("Electron require is not available in info_v2 module");
}

if (window.location.protocol === "file:") {
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = "style.css";
	document.head.append(link);
} else {
	await import("./style.scss");
}

const { shell, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

let currentLang = {};
let languagesDirectory = null;

function loadLanguage(langCode) {
	if (!languagesDirectory) return false;

	const filePath = path.join(languagesDirectory, `${langCode}.json`);

	if (fs.existsSync(filePath)) {
		try {
			currentLang = JSON.parse(fs.readFileSync(filePath, "utf-8"));
			return true;
		} catch (error) {
			console.error("[InfoV2] Failed to parse language file:", filePath, error);
		}
	}

	if (langCode !== "en") {
		return loadLanguage("en");
	}

	currentLang = {};
	return false;
}

function t(key, vars = {}) {
	const parts = key.split(".");
	let value = currentLang;

	for (const part of parts) {
		if (value && typeof value === "object" && part in value) {
			value = value[part];
		} else {
			return key;
		}
	}

	if (typeof value !== "string") return key;

	return value.replace(/\{(\w+)\}/g, (_, name) =>
		name in vars ? vars[name] : `{${name}}`,
	);
}

function applyTranslations() {
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {};
		el.textContent = t(key, vars);
	});
}

const currentVersion = ipcRenderer.sendSync("get-app-version");

document.querySelector(".version").textContent = currentVersion;

ipcRenderer.on("change-language", (_, newLangCode) => {
	if (!languagesDirectory) return;
	loadLanguage(newLangCode);
	applyTranslations();
});

document.getElementById("btn-close").onclick = () =>
	ipcRenderer.send("close-window");

const buttonActions = {
	women: () => {
		const nya = new Audio("../../assets/info-page/nya.mp3");
		nya.play();
		shell.openExternal("https://diram1x.ru");
	},
	githubBtn: () => shell.openExternal("https://github.com/diramix"),
	discordBtn: () => shell.openExternal("https://discord.gg/ky6bcdy7KA"),
	twitterBtn: () => shell.openExternal("https://x.com/Diram1x"),
	boostyBtn: () => shell.openExternal("https://boosty.to/diramix"),
	youtubeBtn: () => shell.openExternal("https://www.youtube.com/@Diram1x"),
	githubRepoBtn: () =>
		shell.openExternal("https://github.com/Web-Next-Music/Next-Music-Client"),
};

Object.entries(buttonActions).forEach(([id, action]) => {
	document.getElementById(id)?.addEventListener("click", action);
});

const initPayload = await ipcRenderer.invoke("info-v2:get-init-data");
languagesDirectory = initPayload.languagesDirectory;
loadLanguage(initPayload.langCode);
applyTranslations();
