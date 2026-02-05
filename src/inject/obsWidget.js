(function () {
    "use strict";

    const WS_URL = "ws://localhost:4091";
    let ws = null;
    let lastPayload = "";

    function log(...args) {
        console.log("[YM-OBSERVER]", ...args);
    }

    function connect() {
        log("Connecting to WebSocket...");
        ws = new WebSocket(WS_URL);

        ws.onopen = () => log("WebSocket connected");
        ws.onclose = () => {
            log("WebSocket disconnected, retry in 2s");
            setTimeout(connect, 2000);
        };
        ws.onerror = (e) => log("WebSocket error", e);
    }

    connect();

    function qs(selector) {
        return document.querySelector(selector);
    }

    function getText(selector) {
        return qs(selector)?.textContent.trim() || "";
    }

    function getCover() {
        const img = qs(
            '[class*="PlayerBar_root"] * [class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] > img',
        );
        return img?.src || "";
    }

    // Получаем значение CSS-переменной --player-average-color-background
    function getPlayerColor() {
        const root = qs('[class*="PlayerBar_root"]');
        if (!root) return null;
        const style = getComputedStyle(root);
        return (
            style
                .getPropertyValue("--player-average-color-background")
                ?.trim() || null
        );
    }

    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const data = {
            title: getText('[class*="PlayerBar_root"] * [class*="Meta_title"]'),
            artist: getText(
                '[class*="PlayerBar_root"] * [class*="SeparatedArtists_root_clamp"]',
            ),
            cover: getCover(),
            color: getPlayerColor(), // добавляем цвет
        };

        if (!data.title) return;

        const payload = JSON.stringify(data);
        if (payload !== lastPayload) {
            lastPayload = payload;
            log("Track changed → sending", data);
            ws.send(payload);
        }
    }, 1000);
})();
