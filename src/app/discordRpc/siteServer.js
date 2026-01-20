(function () {
    "use strict";

    const WS_URL = "ws://localhost:8765";
    let ws;

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => console.log("[WS] ✅ Connected to", WS_URL);
        ws.onerror = (e) => console.error("[WS] ❌ WS Error:", e);
        ws.onclose = () => {
            console.warn("[WS] ⚠️ Connection closed, reconnecting in 3 sec");
            setTimeout(connect, 3000);
        };
    }

    connect();

    function getPlayerData(playerEl) {
        if (!playerEl) return null;

        const img = playerEl.querySelector(
            `[class*="PlayerBar_root"] * [class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] > img`
        )?.src ?? null;

        const title = playerEl.querySelector(
            `[class*="PlayerBar_root"] * [class*="Meta_albumLink"] > span`
        )?.textContent?.trim() ?? null;

        const artists = playerEl.querySelector(
            `[class*="PlayerBar_root"] * [class*="SeparatedArtists_root_clamp"]`
        )?.textContent?.trim() ?? null;

        const timeCurrent = playerEl.querySelector(
            `[class*="PlayerBar_root"] * [class*="TimecodeGroup_timecode_current_animation"] > span`
        )?.textContent ?? null;

        const timeEnd = playerEl.querySelector(
            `[class*="PlayerBar_root"] * [class*="TimecodeGroup_timecode_end"] > span`
        )?.textContent ?? null;

        return { img, title, artists, timeCurrent, timeEnd, ts: Date.now() };
    }

    function sendPlayerData(playerEl, index) {
        const data = getPlayerData(playerEl);
        if (!data) return;
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ playerIndex: index, ...data }));
        }
    }

    // Observe each player for changes
    const players = document.querySelectorAll(
        "section.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN.PlayerBar_root__cXUnU"
    );

    players.forEach((playerEl, index) => {
        const observer = new MutationObserver(() => sendPlayerData(playerEl, index));
        observer.observe(playerEl, {
            childList: true,
            subtree: true,
            characterData: true
        });
    });
})();
