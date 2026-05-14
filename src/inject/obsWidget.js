(function () {
	"use strict";

	const WS_URL = "ws://localhost:4091";
	let ws = null;
	let lastPayload = "";

	function connect() {
		ws = new WebSocket(WS_URL);
		ws.onclose = () => setTimeout(connect, 2000);
		ws.onerror = (e) => console.error("[OBS Widget] WebSocket error", e);
	}

	connect();

	function collectAndSend() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

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
		ws.send(payload);
	}

	function waitForApi() {
		if (window.nextmusicApi) setInterval(collectAndSend, 500);
		else setTimeout(waitForApi, 500);
	}

	waitForApi();
})();
