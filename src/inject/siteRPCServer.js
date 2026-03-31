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

    function log() {} // заглушка

    /* ===================== WEBSOCKET ===================== */

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            pendingData.forEach((data, index) => {
                const payload = { playerIndex: index, ...data };
                ws.send(JSON.stringify(payload));
                pendingData.delete(index);
            });
        };

        ws.onerror = (e) => console.error("[WS] ❌ WS Error:", e);

        ws.onclose = () => {
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

        const artistsStr = track.artistNames?.join(", ") ?? "";

        const artistUrl = track.artistIds?.[0]
            ? `https://music.yandex.ru/artist/${track.artistIds[0]}`
            : null;

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
            playerState: state.status ?? null,
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
            return;
        }

        if (changed) {
            lastSentData = { ...data };
            scheduleSend(data);
        } else if (seeked) {
            sendImmediate(data);
        }
    }

    function waitForApi() {
        if (window.nextmusicApi) {
            setInterval(poll, POLL_INTERVAL);
        } else {
            setTimeout(waitForApi, 500);
        }
    }

    waitForApi();
})();
