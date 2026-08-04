(function () {
	"use strict";

	const WS_URL = "ws://localhost:4091";
	let conn = null;
	let lastPayload = "";

	function connect() {
		conn = window.nextmusicApi.wsReconnect(WS_URL, {
			reconnectDelay: 2000,
			onError: (e) => console.error("[OBS Widget] WebSocket error", e),
		});
	}

	function collectAndSend() {
		if (conn?.getSocket()?.readyState !== WebSocket.OPEN) return;

		const api = window.nextmusicApi;
		const track = api?.getCurrentTrack();
		if (!track) return;

		const state = api.getState();
		const payload = JSON.stringify({
			title: track.title || "",
			artist: track.artistNames?.join(", ") || "",
			cover: track.coverUrl || "",
			color: api.getCurrentAverageColor() || "",
			positionSec: state?.progress?.position ?? 0,
			durationSec: (track.durationMs ?? 0) / 1000,
			playing: state?.status === "playing",
			ts: Date.now(),
		});

		if (payload === lastPayload) return;
		lastPayload = payload;
		conn.send(payload);
	}

	function waitForApi() {
		if (window.nextmusicApi) {
			connect();
			setInterval(collectAndSend, 500);
		} else {
			setTimeout(waitForApi, 500);
		}
	}

	waitForApi();
})();
