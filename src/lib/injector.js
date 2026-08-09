import { injectList } from "../injectList.js";
import { app } from "electron";
import path from "path";
import fs from "fs";

import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function injectScopedCssText(cssText, styleId) {
	if (document.querySelector(`style[data-injected="${styleId}"]`)) return;

	const style = document.createElement("style");
	style.dataset.injected = styleId;
	style.textContent = cssText;
	document.head.appendChild(style);
}

function injectJsFile(injectedPath, encryptionKey) {
	window.__NEXT_MUSIC_ENCRYPTION_KEY__ = encryptionKey;
	if (document.querySelector(`script[data-injected="${injectedPath}"]`))
		return;

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

		const lamejsDevPath = path.resolve(
			__dirname,
			"../../node_modules/lamejs/lame.all.js",
		);

		const fragments = [
			`window.__APP_VERSION__ = ${JSON.stringify(`Next Music/${app.getVersion()}`)};`,
		];
		const injected = [];

		for (const item of injectList) {
			const { file, condition } = item;

			if (typeof condition === "function" && !condition(config)) {
				console.log("[Injector] Skipped by config:", file);
				continue;
			}

			const fullPath =
				isDev && file === "lamejs.js" && fs.existsSync(lamejsDevPath)
					? lamejsDevPath.replace(/\\/g, "/")
					: path.join(injectDir, file).replace(/\\/g, "/");

			if (!fs.existsSync(fullPath)) {
				console.warn("[Injector] ⚠️ File not found:", file);
				continue;
			}

			const isCSS = file.endsWith(".css");
			const isJS = file.endsWith(".js");
			const injectScript = isCSS
				? serializeInvocation(injectCssFile, fullPath)
				: isJS
					? serializeInvocation(
							injectJsFile,
							fullPath,
							ENCRYPTION_KEY,
						)
					: "";

			if (!injectScript) continue;

			fragments.push(
				`try{${injectScript}}catch(e){console.error(${JSON.stringify(`[Injector] inject error: ${file}`)},e);}`,
			);
			injected.push(file);
		}

		if (config?.alpha?.listenAlong?.enable) {
			const noAutoZoomPath = path
				.join(injectDir, "noAutoZoom.css")
				.replace(/\\/g, "/");

			if (fs.existsSync(noAutoZoomPath)) {
				const scopedCss = fs
					.readFileSync(noAutoZoomPath, "utf8")
					.replace(":root {", "#nm-la-panel-host {");
				const styleId = "listenAlongNoAutoZoom";

				fragments.push(
					`try{${serializeInvocation(injectScopedCssText, scopedCss, styleId)}}catch(e){console.error(${JSON.stringify(`[Injector] inject error: ${styleId}`)},e);}`,
				);
				injected.push(`${styleId} (scoped)`);
			}
		}

		mainWindow.webContents
			.executeJavaScript(
				`(() => {
					if (!location.host.includes("music.yandex.ru")) return;
					${fragments.join("\n")}
				})()`,
			)
			.then(() => {
				console.log("[Injector] Injected:", injected.join(", "));
			})
			.catch((err) => {
				console.error("[Injector] ❌ Batch inject failed:", err);
			});
	} catch (err) {
		console.error("[Injector] ❌ Injector error:", err);
	}
}
