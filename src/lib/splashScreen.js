import { nativeTheme } from "electron";
import path from "path";
import fs from "fs";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE = fs.readFileSync(
	path.join(__dirname, "splashScreen.html"),
	"utf8",
);

export function setupSplashScreen(mainWindow, targetUrl) {
	const isDark = nativeTheme.shouldUseDarkColors;

	const videoFile = isDark
		? "splash_screen_dark.webm"
		: "splash_screen_light.webm";

	const videoPath = path
		.join(__dirname, "..", "assets", "splash_screen", videoFile)
		.replace(/\\/g, "/");

	const bgColor = isDark ? "#000" : "#fff";

	const FADE_DURATION = 500;
	const VIDEO_MAX_MS = 10000;

	const html = TEMPLATE.replace(/__BG_COLOR__/g, bgColor)
		.replace(/__VIDEO_SRC__/g, `file://${videoPath}`)
		.replace(/__FADE_MS__/g, String(FADE_DURATION));

	mainWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
	);

	let loaded = false;

	function doFadeAndLoad() {
		if (loaded) return;
		loaded = true;

		mainWindow.webContents
			.executeJavaScript(`document.body.classList.add("fade-out");`)
			.catch(console.error);

		setTimeout(() => mainWindow.loadURL(targetUrl), FADE_DURATION);
	}

	mainWindow.webContents.once("did-finish-load", () => {
		mainWindow.webContents
			.executeJavaScript(
				`
            new Promise(resolve => {
                const v = document.getElementById('v');
                if (!v) return resolve();
                v.addEventListener('ended', resolve);
            })
        `,
			)
			.then(() => doFadeAndLoad())
			.catch(() => doFadeAndLoad());

		setTimeout(() => doFadeAndLoad(), VIDEO_MAX_MS);
	});
}
