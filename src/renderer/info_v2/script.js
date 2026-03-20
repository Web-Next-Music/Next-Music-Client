const { shell, ipcRenderer } = require("electron");
const { t, loadLanguage, initLanguages } = require("../../lib/langManager");

// Version
const { version: currentPkgVersion } = require("../../../package.json");

const CURRENT_VERSION = currentPkgVersion.startsWith("v")
    ? currentPkgVersion
    : `v${currentPkgVersion}`;

document.querySelector(".version").textContent = CURRENT_VERSION;
document.querySelector(".nm_title").textContent =
    `Next Music ${CURRENT_VERSION}`;

// i18n
const { languagesDirectory, langCode } = ipcRenderer.sendSync("get-lang-info");
initLanguages(languagesDirectory, langCode);

function applyTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        const vars = el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {};
        el.textContent = t(key, vars);
    });
}

applyTranslations();

// Реалтайм смена языка
ipcRenderer.on("change-language", (_, newLangCode) => {
    loadLanguage(languagesDirectory, newLangCode);
    applyTranslations();
});

// Close button
document.getElementById("btn-close").onclick = () =>
    ipcRenderer.send("close-window");

// Buttons
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
        shell.openExternal(
            "https://github.com/Web-Next-Music/Next-Music-Client",
        ),
};

Object.entries(buttonActions).forEach(([id, action]) => {
    document.getElementById(id).addEventListener("click", action);
});
