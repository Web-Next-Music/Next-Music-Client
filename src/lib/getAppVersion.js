import { execSync } from "child_process";
import { app } from "electron";
import pkg from "../../package.json" with { type: "json" };

const { version } = pkg;

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
