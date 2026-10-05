import { app } from "electron";
import { buildFragments } from "./buildFragments.js";

export default function injector(mainWindow, config) {
	try {
		const { fragments, injected } = buildFragments(
			config,
			`Next Music/${app.getVersion()}`,
		);

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
