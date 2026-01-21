(function () {
    "use strict";

    const WSPORT = 6972;
    const WS_URL = `ws://127.0.0.1:${WSPORT}`;
    let ws;
    let forceSend = false;

    // Последнее отправленное состояние для каждого плеера
    const lastSentState = new Map();

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

        return {
            img,
            albumUrl,
            artistUrl,
            title,
            artists,
            timeCurrent,
            timeEnd,
            playerState,
            ts: Date.now()
        };
    }

    // Убираем поля, которые НЕ должны влиять на сравнение
    function normalizeForCompare(data) {
        const {
            timeCurrent,
            ts,
            ...rest
        } = data;
        return rest;
    }

    function isChanged(index, data) {
        const normalized = normalizeForCompare(data);
        const last = lastSentState.get(index);

        if (!last) {
            lastSentState.set(index, normalized);
            return true;
        }

        const changed = Object.keys(normalized).some(
            key => normalized[key] !== last[key]
        );

        if (changed) {
            lastSentState.set(index, normalized);
        }

        return changed;
    }

    function sendPlayerData(playerEl, index) {
        // Если forceSend, пересоздаём данные заново
        const data = forceSend ? getPlayerData(playerEl) : getPlayerData(playerEl);
        if (!data) return;

        const shouldSend = forceSend || isChanged(index, data);
        if (!shouldSend) return;

        if (ws?.readyState === WebSocket.OPEN) {
            // payload всегда актуальный, прямо сейчас собранный
            const payload = {
                playerIndex: index,
                ...getPlayerData(playerEl) // ✅ заново вычисляем данные
            };

            ws.send(JSON.stringify(payload));
        }

        // Сохраняем нормализованное состояние только если это не forceSend
        if (!forceSend) {
            const normalized = normalizeForCompare(data);
            lastSentState.set(index, normalized);
        }

        // Сбрасываем флаг после отправки
        forceSend = false;
    }

    // Observe players
    const players = document.querySelectorAll(
        `[class*="PlayerBar_root"]`
    );

    players.forEach((playerEl, index) => {
        const observer = new MutationObserver(() =>
            sendPlayerData(playerEl, index)
        );

        observer.observe(playerEl, {
            childList: true,
            subtree: true,
            characterData: true
        });
    });

    players.forEach((playerEl, index) => {
        const observer = new MutationObserver(() =>
            sendPlayerData(playerEl, index)
        );

        observer.observe(playerEl, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // 🎚️ Слайдер прогресса
        const slider = playerEl.querySelector(
            '[class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]'
        );

        if (slider) {
            const triggerForceSend = () => {
                forceSend = true;
                sendPlayerData(playerEl, index);
            };

            slider.addEventListener("mouseup", triggerForceSend);
            slider.addEventListener("touchend", triggerForceSend);
        }
    });
})();
