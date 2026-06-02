import { app } from "electron";
import { execFileSync } from "child_process";

export function detectInstallType() {
	if (process.platform === "win32") return "nsis";
	if (process.platform === "darwin") return "mac";

	// Linux
	if (getEnv("APPIMAGE")) return "appimage";

	const exe = process.execPath;

	if (ownsPath("pacman", ["-Qo", exe])) return "pacman";
	if (ownsPath("dpkg", ["-S", exe])) return "deb";

	if (hasCommand("pacman")) return "pacman";
	if (hasCommand("dpkg") || hasCommand("apt-get")) return "deb";

	return "unknown";
}

function ownsPath(cmd, args) {
	try {
		execFileSync(cmd, args, { stdio: ["ignore", "ignore", "ignore"] });
		return true;
	} catch {
		return false;
	}
}

function getEnv(name) {
	const proc = globalThis.process;
	return proc && proc.env ? proc.env[name] : undefined;
}

// Returns true if `cmd` is on PATH.
function hasCommand(cmd) {
	try {
		execFileSync("sh", ["-c", `command -v ${cmd}`], {
			stdio: ["ignore", "ignore", "ignore"],
		});
		return true;
	} catch {
		return false;
	}
}

export function isElectronUpdaterType(type) {
	return type === "appimage";
}

export function isWindowsInstallerType(type) {
	return type === "nsis";
}

// System packages we install via pkexec.
export function isSystemPackageType(type) {
	return type === "pacman" || type === "deb";
}
