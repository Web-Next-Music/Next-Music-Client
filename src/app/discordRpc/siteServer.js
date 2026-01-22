(function () {
    "use strict";

    const WSPORT = 6972;
    const WS_URL = `ws://127.0.0.1:${WSPORT}`;
    let ws;

    const lastSentState = new Map();
    const lastTimeCurrent = new Map();
    const pendingData = new Map();
    const canSend = new Map();

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
            '[class*="BaseSonataControlsDesktop_playButtonIcon"] > use'
        )?.href?.baseVal ?? null;

        return { img, albumUrl, artistUrl, title, artists, timeCurrent, timeEnd, playerState };
    }

    function parseTimeToSec(time) {
        if (!time) return 0;
        const parts = time.split(":").map(Number);
        return parts.length === 2
            ? parts[0] * 60 + parts[1]
            : parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : 0;
    }

    // проверка на изменения и накопление timeCurrent
    function isChanged(index, data) {
        const last = lastSentState.get(index);
        const currentSec = parseTimeToSec(data.timeCurrent || "0:00");
        const lastAccum = lastTimeCurrent.get(index) ?? 0;

        let effectiveTimeChange = Math.abs(currentSec - lastAccum);

        if (!last) {
            lastSentState.set(index, { ...data, timeCurrent: undefined });
            lastTimeCurrent.set(index, currentSec);
            return true;
        }

        // сравниваем все поля кроме timeCurrent
        const { timeCurrent, ...rest } = data;
        const { timeCurrent: _, ...lastRest } = last;

        const otherChanged = Object.keys(rest).some(k => rest[k] !== lastRest[k]);

        if (otherChanged || effectiveTimeChange >= 2) {
            lastSentState.set(index, { ...data, timeCurrent: undefined });
            lastTimeCurrent.set(index, currentSec);
            return true;
        }

        return false;
    }

    function sendPlayerData(playerEl, index) {
        const data = getPlayerData(playerEl);
        if (!data) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        if (!canSend.get(index)) {
            // кулдаун активен, сохраняем последние данные
            pendingData.set(index, data);
            return;
        }

        if (isChanged(index, data)) {
            ws.send(JSON.stringify({ playerIndex: index, ...data }));
        }

        // ставим кулдаун на 2 секунды
        canSend.set(index, false);
        setTimeout(() => {
            canSend.set(index, true);
            // если за 2 сек накопились новые данные — отправляем последние
            const pending = pendingData.get(index);
            if (pending) {
                pendingData.delete(index);
                sendPlayerData(playerEl, index);
            }
        }, 2000);
    }

    const players = document.querySelectorAll(`[class*="PlayerBar_root"]`);

    players.forEach((playerEl, index) => {
        canSend.set(index, true);

        const observer = new MutationObserver(() => sendPlayerData(playerEl, index));
        observer.observe(playerEl, { childList: true, subtree: true, characterData: true });

        const slider = playerEl.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]');
        if (slider) {
            const triggerSend = () => sendPlayerData(playerEl, index);
            slider.addEventListener("mouseup", triggerSend);
            slider.addEventListener("touchend", triggerSend);
        }
    });
})();
