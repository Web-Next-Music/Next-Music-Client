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

    function getCurrentTime() {
        return getText(
            '[class*="PlayerBar_root"] * [class*="TimecodeGroup_timecode_current_animation"] > span',
        );
    }

    function getDuration() {
        return getText(
            '[class*="PlayerBar_root"] * [class*="TimecodeGroup_timecode_end"] > span',
        );
    }

    function collectAndSend() {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const data = {
            title: getText('[class*="PlayerBar_root"] * [class*="Meta_title"]'),
            artist: getText(
                '[class*="PlayerBar_root"] * [class*="SeparatedArtists_root_clamp"]',
            ),
            cover: getCover(),
            color: getPlayerColor(),
            position: getCurrentTime(),
            duration: getDuration(),
        };

        if (!data.title) return;

        const payload = JSON.stringify(data);

        if (payload !== lastPayload) {
            lastPayload = payload;
            log("DOM change → sending", data);
            ws.send(payload);
        }
    }

    function waitForPlayerAndObserve() {
        const root = qs('[class*="PlayerBar_root"]');
        if (!root) {
            setTimeout(waitForPlayerAndObserve, 500);
            return;
        }

        log("PlayerBar found, observing…");

        const observer = new MutationObserver(() => {
            collectAndSend();
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
        });

        // первый пуш сразу
        collectAndSend();
    }

    waitForPlayerAndObserve();
})();
