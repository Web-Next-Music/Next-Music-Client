(function () {
    "use strict";

    const WSPORT = 6972;

    const WS_URL = `ws://127.0.0.1:${WSPORT}`;
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
            `[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] > img`
        )?.src ?? null;

        const albumUrl = playerEl.querySelector(
            `[class*="Meta_albumLink"]`
        )?.href?.trim() ?? null;

        const artistUrl = playerEl.querySelector(
            `[class*="Meta_link"]`
        )?.href?.trim() ?? null;

        const title = playerEl.querySelector(
            `[class*="Meta_title"]`
        )?.textContent?.trim() ?? null;

        const artists = playerEl.querySelector(
            `[class*="SeparatedArtists_root_clamp"]`
        )?.textContent?.trim() ?? null;

        const timeCurrent = playerEl.querySelector(
            `[class*="TimecodeGroup_timecode_current_animation"] > span`
        )?.textContent ?? null;

        const timeEnd = playerEl.querySelector(
            `[class*="TimecodeGroup_timecode_end"] > span`
        )?.textContent ?? null;

        const playerState = playerEl.querySelector(
            '[class*="BaseSonataControlsDesktop_playButtonIcon__TlFqv"] > use'
        )?.href?.baseVal ?? null;

        return { img, albumUrl, artistUrl, title, artists, timeCurrent, timeEnd, playerState, ts: Date.now() };
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
        `[class*="PlayerBar_root"]`
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
