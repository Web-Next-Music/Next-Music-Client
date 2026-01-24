(function () {
    "use strict";

    const WSPORT = 6972;
    const WS_URL = `ws://127.0.0.1:${WSPORT}`;
    let ws;

    const lastSentState = new Map();
    const lastTimeCurrent = new Map();
    const pendingData = new Map();
    const cooldownDuration = 2000;
    const cooldownTimers = new Map();

    function log(index, msg, data) {
        console.log(
            `%c[PLAYER ${index}] ${msg}`,
            "color:#4caf50;font-weight:bold;",
            data ?? "",
        );
    }

    /* ===================== WEBSOCKET ===================== */

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log("[WS] ✅ Connected to", WS_URL);

            // отправляем все pending данные, которые могли накопиться
            pendingData.forEach((data, index) => {
                const payload = { playerIndex: index, ...data };
                ws.send(JSON.stringify(payload));
                log(index, "📤 Sent pending on reconnect", payload);
                pendingData.delete(index);
            });
        };

        ws.onerror = (e) => console.error("[WS] ❌ WS Error:", e);

        ws.onclose = () => {
            console.warn("[WS] ⚠️ Connection closed, reconnecting in 3 sec");
            setTimeout(connect, 3000);
        };
    }

    connect();

    /* ===================== DATA EXTRACTION ===================== */

    function getPlayerData(playerEl) {
        if (!playerEl) return null;
        return {
            img:
                playerEl.querySelector(
                    `[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"] > img`,
                )?.src ?? null,
            albumUrl:
                playerEl
                    .querySelector(`[class*="Meta_albumLink"]`)
                    ?.href?.trim() ?? null,
            artistUrl:
                playerEl.querySelector(`[class*="Meta_link"]`)?.href?.trim() ??
                null,
            title:
                playerEl
                    .querySelector(`[class*="Meta_title"]`)
                    ?.textContent?.trim() ?? null,
            artists:
                playerEl
                    .querySelector(`[class*="SeparatedArtists_root_clamp"]`)
                    ?.textContent?.trim() ?? null,
            timeCurrent:
                playerEl.querySelector(
                    `[class*="TimecodeGroup_timecode_current_animation"] > span`,
                )?.textContent ?? null,
            timeEnd:
                playerEl.querySelector(
                    `[class*="TimecodeGroup_timecode_end"] > span`,
                )?.textContent ?? null,
            playerState:
                playerEl.querySelector(
                    '[class*="BaseSonataControlsDesktop_playButtonIcon"] > use',
                )?.href?.baseVal ?? null,
        };
    }

    function parseTimeToSec(time) {
        if (!time) return 0;
        const p = time.split(":").map(Number);
        return p.length === 2
            ? p[0] * 60 + p[1]
            : p.length === 3
              ? p[0] * 3600 + p[1] * 60 + p[2]
              : 0;
    }

    /* ===================== CHANGE DETECTION ===================== */

    function isTimeJump(index, data) {
        const current = parseTimeToSec(data.timeCurrent || "");
        const last = lastTimeCurrent.get(index);
        lastTimeCurrent.set(index, current);
        if (last == null) return false;
        return Math.abs(current - last) > 1;
    }

    function isStateChanged(index, data) {
        const last = lastSentState.get(index);
        if (!last) {
            lastSentState.set(index, { ...data, timeCurrent: undefined });
            log(index, "🆕 First state detected");
            return true;
        }
        const { timeCurrent, ...rest } = data;
        const { timeCurrent: _, ...lastRest } = last;
        const changed = Object.keys(rest).some((k) => rest[k] !== lastRest[k]);
        if (changed)
            lastSentState.set(index, { ...data, timeCurrent: undefined });
        return changed;
    }

    /* ===================== SEND LOGIC ===================== */

    function scheduleSend(playerEl, index, data) {
        pendingData.set(index, data);

        // если уже есть таймер, сбрасываем его
        if (cooldownTimers.has(index)) {
            clearTimeout(cooldownTimers.get(index));
        }

        // ставим новый таймер
        const timer = setTimeout(() => {
            const pending = pendingData.get(index);
            if (pending && ws && ws.readyState === WebSocket.OPEN) {
                const payload = { playerIndex: index, ...pending };
                ws.send(JSON.stringify(payload));
                log(index, "📤 Sent after cooldown", payload);
            }
            pendingData.delete(index);
            cooldownTimers.delete(index);
        }, cooldownDuration);

        cooldownTimers.set(index, timer);
    }

    function sendPlayerData(playerEl, index) {
        const data = getPlayerData(playerEl);
        if (!data || data.timeCurrent === "00:00") return;

        const timeJump = isTimeJump(index, data);
        const stateChanged = isStateChanged(index, data);

        if (!timeJump && !stateChanged) return;

        log(
            index,
            timeJump
                ? "⏩ Triggered (time jump)"
                : "📤 Triggered (state change)",
            data,
        );
        scheduleSend(playerEl, index, data);
    }

    /* ===================== OBSERVER ===================== */

    const players = document.querySelectorAll(`[class*="PlayerBar_root"]`);
    players.forEach((playerEl, index) => {
        log(index, "👀 Player observer initialized");

        const playerObserve = new MutationObserver(() =>
            sendPlayerData(playerEl, index),
        );
        playerObserve.observe(playerEl, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        const slider = playerEl.querySelector(
            '[class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]',
        );
        if (slider) {
            const trigger = () => sendPlayerData(playerEl, index);
            slider.addEventListener("mouseup", trigger);
            slider.addEventListener("touchend", trigger);
        }
    });
})();
