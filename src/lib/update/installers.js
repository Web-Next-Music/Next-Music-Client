import { app } from "electron";
import https from "https";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { t } from "../langManager.js";
import { state } from "./state.js";
import {
	sendStatus,
	sendToLoader,
	fallbackOpenRelease,
} from "./manualUpdateFlow.js";

export async function runWindowsInstallerUpdate() {
	const asset = pickAsset(state.releaseInfo, state.installType);
	if (!asset?.browser_download_url) {
		fallbackOpenRelease();
		return;
	}

	const dest = path.join(app.getPath("temp"), asset.name);
	await downloadFile(asset.browser_download_url, dest);

	sendStatus(t("updater.installing"));
	global.__nmcQuitting = true;

	const child = spawn(dest, [], {
		detached: true,
		stdio: "ignore",
	});
	child.unref();

	setTimeout(() => app.quit(), 200);
}

export async function runSystemPackageUpdate() {
	const asset = pickAsset(state.releaseInfo, state.installType);
	if (!asset?.browser_download_url) {
		throw new Error("No suitable package asset found for this install type");
	}

	const dest = path.join(app.getPath("temp"), asset.name);
	await downloadFile(asset.browser_download_url, dest);

	sendStatus(t("updater.installing"));
	await installSystemPackage(dest, state.installType);

	sendStatus(t("updater.restarting"));
	global.__nmcQuitting = true;

	const installedBin = "/usr/bin/next-music";
	if (fs.existsSync(installedBin)) {
		app.relaunch({ execPath: installedBin });
	} else {
		app.relaunch();
	}
	app.exit(0);
}

export function pickAsset(release, type) {
	const assets = release?.assets || [];
	let ext;
	if (type === "nsis") ext = ".exe";
	else if (type === "pacman") ext = ".pkg.tar.zst";
	else if (type === "rpm") ext = ".rpm";
	else ext = ".deb";
	return assets.find(
		(a) => typeof a.name === "string" && a.name.endsWith(ext),
	);
}

export function installSystemPackage(file, type) {
	return new Promise((resolve, reject) => {
		let args;
		if (type === "pacman") {
			args = ["pacman", "-U", "--noconfirm", file];
		} else if (type === "rpm") {
			// Fedora/RHEL-based: prefer dnf to resolve dependencies,
			// fall back to plain rpm if dnf is unavailable.
			args = [
				"sh",
				"-c",
				`command -v dnf >/dev/null 2>&1 && dnf install -y "${file}" || rpm -Uvh --force "${file}"`,
			];
		} else {
			args = [
				"sh",
				"-c",
				`apt-get install -y "${file}" || { dpkg -i "${file}"; apt-get install -f -y; }`,
			];
		}

		const child = spawn("pkexec", args, {
			stdio: ["ignore", "ignore", "pipe"],
			env: {
				...process.env,
				DISPLAY: process.env.DISPLAY || ":0",
				XAUTHORITY: process.env.XAUTHORITY || "",
				XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || "",
			},
		});

		let stderr = "";
		child.stderr.on("data", (d) => (stderr += d.toString()));
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`pkexec exited ${code}: ${stderr.trim()}`));
		});
	});
}

export function downloadFile(url, dest) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);
		let lastTime = Date.now();
		let lastBytes = 0;

		function request(currentUrl) {
			https
				.get(
					currentUrl,
					{ headers: { "User-Agent": "Next-Music-Updater" } },
					(res) => {
						if (
							res.statusCode >= 300 &&
							res.statusCode < 400 &&
							res.headers.location
						) {
							res.resume();
							request(res.headers.location);
							return;
						}

						if (res.statusCode !== 200) {
							res.resume();
							reject(new Error(`HTTP ${res.statusCode}`));
							return;
						}

						const total =
							Number(res.headers["content-length"]) || 0;
						let transferred = 0;

						res.on("data", (chunk) => {
							transferred += chunk.length;
							const now = Date.now();
							const dt = (now - lastTime) / 1000;
							if (dt >= 0.25) {
								sendToLoader("nmc-update:progress", {
									percent: total
										? (transferred / total) * 100
										: 0,
									transferred,
									total,
									bytesPerSecond:
										(transferred - lastBytes) / dt,
								});
								lastTime = now;
								lastBytes = transferred;
							}
						});

						res.pipe(file);
						file.on("finish", () => {
							sendToLoader("nmc-update:progress", {
								percent: 100,
								transferred,
								total,
								bytesPerSecond: 0,
							});
							file.close(() => resolve());
						});
					},
				)
				.on("error", (err) => {
					fs.unlink(dest, () => reject(err));
				});
		}

		file.on("error", (err) => {
			fs.unlink(dest, () => reject(err));
		});

		request(url);
	});
}
