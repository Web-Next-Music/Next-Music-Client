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
			const match = envContent.match(/ENCRYPTION_KEY=(.+)/);
			return match ? match[1].trim() : "";
		} catch {
			return "";
		}
	})();

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

			let content = "";
			if (isJS) {
				content = fs.readFileSync(fullPath, "utf8");
				if (content.includes("__ENCRYPTION_KEY__")) {
					content = content.replace(
						/__ENCRYPTION_KEY__/g,
						JSON.stringify(ENCRYPTION_KEY),
					);
				}
			}

			const injectScript = isCSS
				? `
                (() => {
                    const injectedPath = "${fullPath}";
                    if (!document.querySelector('link[data-injected="' + injectedPath + '"]')) {
                        const l = document.createElement("link");
                        l.rel = "stylesheet";
                        l.type = "text/css";
                        l.href = "file://" + injectedPath;
                        l.dataset.injected = injectedPath;
                        document.head.appendChild(l);
                    }
                })();
                `
				: `
                (() => {
                    const injectedPath = "${fullPath}";
                    if (!document.querySelector('script[data-injected="' + injectedPath + '"]')) {
                        const s = document.createElement("script");
                        s.type = "text/javascript";
                        s.dataset.injected = injectedPath;
                        s.textContent = ${JSON.stringify(content)};
                        document.head.appendChild(s);
                    }
                })();
                `;

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
