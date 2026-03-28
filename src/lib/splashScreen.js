import { nativeTheme } from "electron";
import path from "path";

// ESM __dirname fix
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    const html = `
        <html>
        <body style="margin:0;background:${bgColor};display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;">
        <video id="v" autoplay muted playsinline style="object-fit:contain;">
            <source src="file://${videoPath}" type="video/webm">
        </video>
        <style>
            video {
                width: 100%;
                height: 100%;
                filter: hue-rotate(130deg);
            }
        </style>
        </body></html>
    `;

    mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );

    let loaded = false;

    function doFadeAndLoad() {
        if (loaded) return;
        loaded = true;

        mainWindow.webContents
            .executeJavaScript(
                `
            document.body.style.transition = 'opacity ${FADE_DURATION}ms cubic-bezier(0.4,0,0.2,1)';
            document.body.style.opacity = '0';
        `,
            )
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
