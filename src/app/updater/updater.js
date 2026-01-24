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
                        Accept: "application/vnd.github+json",
                    },
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
                },
            )
            .on("error", reject);
    });
}

async function checkForUpdates() {
    try {
        const release = await getJson(GITHUB_API_URL);
        if (!release?.name) return;

        const latestVersion = release.name;

        console.log("[Updater] Current:", CURRENT_VERSION);
        console.log("[Updater] Latest:", latestVersion);

        // НЕ beta → обычная проверка
        if (!CURRENT_VERSION.includes("beta")) {
            if (latestVersion !== CURRENT_VERSION) {
                await app.whenReady();
                showUpdateDialog(latestVersion, release.html_url);
            }
            return;
        }

        // beta → умная логика
        const currentMatch = CURRENT_VERSION.match(
            /^(\d+\.\d+\.\d+)-beta[.-]?(\d+)?$/,
        );
        if (!currentMatch) return;

        const currentBase = currentMatch[1];
        const currentBeta = Number(currentMatch[2] ?? 0);

        const latestBetaMatch = latestVersion.match(
            /^(\d+\.\d+\.\d+)-beta[.-]?(\d+)?$/,
        );
        const latestStableMatch = latestVersion.match(/^(\d+\.\d+\.\d+)$/);

        let latestBase;
        let latestBeta = null; // null = stable

        if (latestBetaMatch) {
            latestBase = latestBetaMatch[1];
            latestBeta = Number(latestBetaMatch[2] ?? 0);
        } else if (latestStableMatch) {
            latestBase = latestStableMatch[1];
        } else {
            return;
        }

        // Сравниваем базовую версию
        const currentParts = currentBase.split(".").map(Number);
        const latestParts = latestBase.split(".").map(Number);

        for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i]) {
                await app.whenReady();
                showUpdateDialog(latestVersion, release.html_url);
                return;
            }
            if (latestParts[i] < currentParts[i]) return;
        }

        // База одинаковая
        // stable всегда выше beta
        if (latestBeta === null) {
            await app.whenReady();
            showUpdateDialog(latestVersion, release.html_url);
            return;
        }

        // beta → beta
        if (latestBeta > currentBeta) {
            await app.whenReady();
            showUpdateDialog(latestVersion, release.html_url);
        }
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
            noLink: true,
        })
        .then(({ response }) => {
            if (response === 0) {
                shell.openExternal(releaseUrl);
            }
        });
}

module.exports = {
    checkForUpdates,
};
