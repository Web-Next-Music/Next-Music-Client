(function () {
    "use strict";

    const WSPORT = 6972;
    const WS_URL = `ws://127.0.0.1:${WSPORT}`;
    const POLL_INTERVAL = 1000; // ms
    let ws;

    const pendingData = new Map();
    const cooldownDuration = 2000;
    const cooldownTimers = new Map();

    let lastSentData = null;
    let lastPosition = null;

    function log(msg, data) {
        console.log(
            `%c[PLAYER] ${msg}`,
            "color:#4caf50;font-weight:bold;",
            data ?? "",
        );
    }

    /* ===================== WEBSOCKET ===================== */

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            console.log("[WS] Connected to", WS_URL);
            pendingData.forEach((data, index) => {
                const payload = { playerIndex: index, ...data };
                ws.send(JSON.stringify(payload));
                log("Sent pending on reconnect", payload);
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

    function getPlayerData() {
        const api = window.nextmusicApi;
        if (!api) return null;

        const track = api.getCurrentTrack();
        const state = api.getState();
        if (!track || !state) return null;

        // artists — массив объектов [{id, name}], берём строку из artistNames
        const artistsStr = track.artistNames?.join(", ") ?? "";

        // artistUrl из первого artistId
        const artistUrl = track.artistIds?.[0]
            ? `https://music.yandex.ru/artist/${track.artistIds[0]}`
            : null;

        // albumUrl из albumId — null для приватных треков
        const albumUrl = track.albumId
            ? `https://music.yandex.ru/album/${track.albumId}`
            : null;

        return {
            trackId: track.id ?? null,
            title: track.title ?? null,
            artists: artistsStr,
            img: track.coverUrl ?? null,
            albumUrl,
            artistUrl,
            trackUrl: track.trackUrl ?? null,
            positionSec: state.progress?.position ?? 0,
            durationSec: (track.durationMs ?? 0) / 1000,
            playerState: state.status ?? null, // "playing" | "paused"
        };
    }

    /* ===================== CHANGE DETECTION ===================== */

    function isSeekJump(positionSec) {
        const last = lastPosition;
        const expected = last != null ? last + POLL_INTERVAL / 1000 : null;
        lastPosition = positionSec;
        if (expected == null) return false;
        return Math.abs(positionSec - expected) > 2;
    }

    function isStateChanged(data) {
        if (!lastSentData) return true;
        return (
            data.trackId !== lastSentData.trackId ||
            data.title !== lastSentData.title ||
            data.artists !== lastSentData.artists ||
            data.playerState !== lastSentData.playerState ||
            data.img !== lastSentData.img
        );
    }

    /* ===================== SEND LOGIC ===================== */

    function scheduleSend(data) {
        const index = 0;
        pendingData.set(index, data);

        if (cooldownTimers.has(index)) clearTimeout(cooldownTimers.get(index));

        const timer = setTimeout(() => {
            const pending = pendingData.get(index);
            if (pending && ws && ws.readyState === WebSocket.OPEN) {
                const payload = { playerIndex: index, ...pending };
                ws.send(JSON.stringify(payload));
                log("Sent after cooldown", payload);
            }
            pendingData.delete(index);
            cooldownTimers.delete(index);
        }, cooldownDuration);

        cooldownTimers.set(index, timer);
    }

    function sendImmediate(data) {
        const index = 0;
        if (ws && ws.readyState === WebSocket.OPEN) {
            const payload = { playerIndex: index, ...data };
            ws.send(JSON.stringify(payload));
            log("Sent immediately (seek)", payload);
        } else {
            pendingData.set(index, data);
        }
    }

    /* ===================== POLL LOOP ===================== */

    function poll() {
        const data = getPlayerData();
        if (!data) return;

        const seeked = isSeekJump(data.positionSec);
        const changed = isStateChanged(data);

        if (!changed && !seeked) return;

        if (seeked && !changed && window.__liSyncSeeking) {
            log("Seek suppressed (listenAlong sync)", data);
            return;
        }

        log(changed ? "Triggered (state change)" : "Triggered (seek)", data);

        if (changed) {
            lastSentData = { ...data };
            scheduleSend(data);
        } else if (seeked) {
            sendImmediate(data);
        }
    }

    function waitForApi() {
        if (window.nextmusicApi) {
            log("window.nextmusicApi found, starting poll loop");
            setInterval(poll, POLL_INTERVAL);
        } else {
            setTimeout(waitForApi, 500);
        }
    }

    waitForApi();
})();
