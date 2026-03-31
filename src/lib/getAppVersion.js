import { execSync } from "child_process";
import { app } from "electron";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

function parsePackageVersion() {
    return version.startsWith("v") ? version : `v${version}`;
}

function parseGitCommit() {
    try {
        const hash = execSync("git rev-parse --short HEAD", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();

        return hash;
    } catch {
        // git недоступен или папка не является репозиторием
        return version;
    }
}

/**
 * Возвращает версию приложения:
 * - билд (app.isPackaged):    "v1.2.3"      из package.json
 * - исходники:                "dev-a1b2c3d"  последний git-коммит
 */
export function getCurrentVersion() {
    return app.isPackaged ? parsePackageVersion() : parseGitCommit();
}
