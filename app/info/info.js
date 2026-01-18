const { shell } = require('electron');
const fs = require('fs');

let currentPkgVersion = "v1.6.5";
document.querySelector(".version").textContent = currentPkgVersion;
const title = `Next Music ${currentPkgVersion} By Diramix`
document.querySelector(".nm_title").textContent = title;

// Buttons
const buttonActions = {
    women: () => {
        const nya = new Audio('./assets/nya.mp3');
        nya.play();
        shell.openExternal("https://shikimori.one/Diramix");
    },
    discordBtn: () => shell.openExternal("https://discord.gg/ky6bcdy7KA"),
    githubBtn: () => shell.openExternal("https://github.com/diramix"),
    boostyBtn: () => shell.openExternal("https://boosty.to/diramix"),
    youtubeBtn: () => shell.openExternal("https://www.youtube.com/@Diram1x")
};

Object.entries(buttonActions).forEach(([id, action]) => {
    document.getElementById(id).addEventListener("click", action);
});