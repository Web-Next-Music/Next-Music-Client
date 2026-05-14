(function () {
	"use strict";

	const WS_URL = "ws://localhost:4091";
	let ws = null;
	let lastPayload = "";

	function log(...args) {
		console.log("[OBS Widget]", ...args);
	}

	function connect() {
		log("Connecting to WebSocket...");
		ws = new WebSocket(WS_URL);

		ws.onopen = () => log("WebSocket connected");
		ws.onclose = () => {
			log("WebSocket disconnected, retry in 2s");
			setTimeout(connect, 2000);
		};
		ws.onerror = (e) => log("WebSocket error", e);
	}

	connect();

	function formatTime(seconds) {
		if (!isFinite(seconds) || seconds < 0) return "0:00";
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	}

	function collectAndSend() {
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		const api = window.nextmusicApi;
		if (!api) return;

		const track = api.getCurrentTrack();
		const state = api.getState();
		if (!track) return;

		const positionSec = state?.progress?.position ?? 0;
		const durationSec = (track.durationMs ?? 0) / 1000;
		const data = {
			title: track.title || "",
			artist: track.artistNames?.join(", ") || "",
			cover: track.coverUrl || "",
			color: api.getCurrentAverageColor() || "",
			position: formatTime(positionSec),
			duration: formatTime(durationSec),
		};

		const payload = JSON.stringify(data);
		if (payload !== lastPayload) {
			lastPayload = payload;
			log("State change → sending", data);
			ws.send(payload);
		}
	}

	function waitForApi() {
		if (window.nextmusicApi) {
			log("nextmusicApi found, starting polling…");
			setInterval(collectAndSend, 500);
		} else {
			setTimeout(waitForApi, 500);
		}
	}

	waitForApi();
})();
