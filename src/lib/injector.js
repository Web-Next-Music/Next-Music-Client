import { injectList } from "../config.js";
import path from "path";
import fs from "fs";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function injector(mainWindow, config) {
    try {
        const injectDir = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "../inject",
        );

        for (const item of injectList) {
            const { file, condition } = item;

            if (typeof condition === "function" && !condition(config)) {
                console.log("[Injector] ⏭ Skipped by config:", file);
                continue;
            }

            const fullPath = path.join(injectDir, file).replace(/\\/g, "/");

            if (!fs.existsSync(fullPath)) {
                console.warn("[Injector] ⚠️ File not found:", file);
                continue;
            }

            const isCSS = file.endsWith(".css");

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
                        s.src = "file://" + injectedPath;
                        s.type = "text/javascript";
                        s.defer = true;
                        s.dataset.injected = injectedPath;
                        document.head.appendChild(s);
                    }
                })();
                `;

            mainWindow.webContents
                .executeJavaScript(injectScript)
                .then(() => {
                    console.log("[Injector] ✅ Injected:", file);
                })
                .catch((err) => {
                    console.error("[Injector] ❌ Failed to inject:", file, err);
                });
        }
    } catch (err) {
        console.error("[Injector] ❌ Injector error:", err);
    }
}
