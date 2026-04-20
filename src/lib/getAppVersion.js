import { execSync } from "child_process";
import { app } from "electron";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

function parsePackageVersion() {
	return version;
}

function parsePackageVersionWV() {
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
		return version;
	}
}

export function getCurrentVersion() {
	return app.isPackaged ? parsePackageVersion() : parseGitCommit();
}

export function getCurrentVersionWV() {
	return app.isPackaged ? parsePackageVersionWV() : parseGitCommit();
}
