import { isDev, devUrl } from "../config.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _rendererBase = path.resolve(__dirname, "../renderer");

export function loadRendererPage(win, subPath) {
	if (isDev) {
		win.loadURL(`${devUrl}/src/renderer/${subPath}`);
	} else {
		win.loadFile(path.join(_rendererBase, subPath));
	}
}
