import { execSync } from "child_process";
import { app } from "electron";

function parsePackageVersion() {
	return app.getVersion();
}

function parsePackageVersionWV() {
	const version = app.getVersion();
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
		return app.getVersion();
	}
}

export function getCurrentVersion() {
	return app.isPackaged ? parsePackageVersion() : parseGitCommit();
}

export function getCurrentVersionWV() {
	return app.isPackaged ? parsePackageVersionWV() : parseGitCommit();
}
