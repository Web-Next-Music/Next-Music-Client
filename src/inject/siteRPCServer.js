(function () {
	"use strict";

	const WSPORT = 6972;
	const WS_URL = `ws://127.0.0.1:${WSPORT}`;
	const POLL_INTERVAL = 1000; // ms
	const ENCRYPTION_KEY = window.__NEXT_MUSIC_ENCRYPTION_KEY__ || "";

	let ws;

	function encodeTrackKey(data) {
		const compact = { u: data.url };
		if (data.title) compact.t = data.title;
		if (data.artist) compact.a = data.artist;
		if (data.cover) compact.c = data.cover;
		const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
		const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
		const out = new Uint8Array(jsonBytes.length);
		for (let i = 0; i < jsonBytes.length; i++)
			out[i] = jsonBytes[i] ^ keyBytes[i % keyBytes.length];
		return btoa(String.fromCharCode(...out))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");
	}

	const pendingData = new Map();
	const cooldownDuration = 2000;
	const cooldownTimers = new Map();

	let lastSentData = null;
	let lastPosition = null;

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

		const mp3Url = api.getCurrentMp3Url() ?? null;
		const nmUGCPlayerUrl = mp3Url
			? `https://nm.diram1x.ru/track?key=${encodeTrackKey({
					url: mp3Url,
					title: track.title,
					artist: artistsStr,
					cover: track.coverUrl,
				})}`
			: null;

		return {
			trackId: track.id ?? null,
			title: track.title ?? null,
			artists: artistsStr,
			img: track.coverUrl ?? null,
			artistUrl,
			mp3Url,
			positionSec: state.progress?.position ?? 0,
			durationSec: (track.durationMs ?? 0) / 1000,
			playerState: state.status ?? null,
			nmUGCPlayerUrl: nmUGCPlayerUrl ?? null,
		};
	}

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
