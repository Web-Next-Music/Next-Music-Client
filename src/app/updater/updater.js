const https = require("https");
const { app, dialog, shell } = require("electron");

const { version: CURRENT_VERSION } = require("../../../package.json");

const GITHUB_API_URL =
    "https://api.github.com/repos/Web-Next-Music/Next-Music-Client/releases/latest";

function getJson(url) {
    return new Promise((resolve, reject) => {
        https
            .get(
                url,
                {
                    headers: {
                        "User-Agent": "Next-Music-Updater",
                        "Accept": "application/vnd.github+json"
                    }
                },
                (res) => {
                    let data = "";

                    res.on("data", (chunk) => (data += chunk));
                    res.on("end", () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
            )
            .on("error", reject);
    });
}

// ✅ ТОЛЬКО ФУНКЦИЯ
async function checkForUpdates() {
    try {
        const release = await getJson(GITHUB_API_URL);
        if (!release?.name) return;

        const latestVersion = release.name;

        console.log("[Updater] Current:", CURRENT_VERSION);
        console.log("[Updater] Latest:", latestVersion);

        if (latestVersion === CURRENT_VERSION) return;

        await app.whenReady();
        showUpdateDialog(latestVersion, release.html_url);
    } catch (err) {
        console.error("[Updater] Update check failed:", err);
    }
}

function showUpdateDialog(version, releaseUrl) {
    dialog
        .showMessageBox({
            type: "info",
            title: "Update available",
            message: `A new version ${version} is available.`,
            detail: "Do you want to update?",
            buttons: ["Yes", "Cancel"],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        })
        .then(({ response }) => {
            if (response === 0) {
                shell.openExternal(releaseUrl);
            }
        });
}

module.exports = {
    checkForUpdates
};
