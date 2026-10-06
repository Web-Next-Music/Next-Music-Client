const ws = new WebSocket("ws://localhost:4091");

let state = null;

function formatTime(seconds) {
	if (!isFinite(seconds) || seconds < 0) return "0:00";
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

ws.onmessage = (e) => {
	state = JSON.parse(e.data);

	document.getElementById("cover").src = state.cover || "assets/icon-256.png";
	document.getElementById("title").textContent = state.title || "";
	document.getElementById("artist").textContent = state.artist || "";
	document
		.getElementById("widget")
		.style.setProperty("--track-color", state.color || "#141414");
	document.getElementById("ts_end").textContent = formatTime(state.durationSec);
};

function tick() {
	if (!state) return;

	const elapsed = state.playing ? (Date.now() - state.ts) / 1000 : 0;
	const position = Math.min(state.positionSec + elapsed, state.durationSec);
	const percent =
		state.durationSec > 0 ? (position / state.durationSec) * 100 : 0;

	document.getElementById("ts_start").textContent = formatTime(position);
	document.getElementById("progress").style.width =
		Math.min(percent, 100) + "%";
}

setInterval(tick, 500);
