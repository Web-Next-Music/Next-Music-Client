import { injectList } from "../config.js";
import path from "path";
import fs from "fs";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load encryption key
const ENCRYPTION_KEY =
	process.env.ENCRYPTION_KEY ||
	(() => {
		try {
			const envPath = path.resolve(__dirname, "../../.env");
			const envContent = fs.readFileSync(envPath, "utf8");
			const match = envContent.match(/ENCRYPTION_KEY=([^\n\r]+)/);
			return match ? match[1].trim() : "";
		} catch {
			return "";
		}
	})();

function serializeInvocation(fn, ...args) {
	return `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")});`;
}

function injectCssFile(injectedPath) {
	if (document.querySelector(`link[data-injected="${injectedPath}"]`)) return;

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.type = "text/css";
	link.href = `file://${injectedPath}`;
	link.dataset.injected = injectedPath;
	document.head.appendChild(link);
}

function injectJsFile(injectedPath, encryptionKey) {
	window.__NEXT_MUSIC_ENCRYPTION_KEY__ = encryptionKey;
	if (document.querySelector(`script[data-injected="${injectedPath}"]`)) return;

	const script = document.createElement("script");
	script.type = "text/javascript";
	script.src = `file://${injectedPath}`;
	script.dataset.injected = injectedPath;
	document.head.appendChild(script);
}

export default function injector(mainWindow, config) {
	try {
		const isDev = __dirname.includes(path.sep + "src" + path.sep);
		const injectDir = isDev
			? path.resolve(__dirname, "../../src/inject")
			: path.join(__dirname, "../inject");

		for (const item of injectList) {
			const { file, condition } = item;

			if (typeof condition === "function" && !condition(config)) {
				console.log("[Injector] Skipped by config:", file);
				continue;
			}

			const fullPath = path.join(injectDir, file).replace(/\\/g, "/");

			if (!fs.existsSync(fullPath)) {
				console.warn("[Injector] ⚠️ File not found:", file);
				continue;
			}

			const isCSS = file.endsWith(".css");
			const isJS = file.endsWith(".js");
			const injectScript = isCSS
				? serializeInvocation(injectCssFile, fullPath)
				: isJS
					? serializeInvocation(injectJsFile, fullPath, ENCRYPTION_KEY)
					: "";

			mainWindow.webContents
				.executeJavaScript(injectScript)
				.then(() => {
					console.log("[Injector] Injected:", file);
				})
				.catch((err) => {
					console.error("[Injector] ❌ Failed to inject:", file, err);
				});
		}
	} catch (err) {
		console.error("[Injector] ❌ Injector error:", err);
	}
}
