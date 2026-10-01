// Volume normalization is borrowed from PulseSync Mod:
// https://github.com/PulseSync-LLC/PulseSync-mod
// Ported from its setR128Gain, which reads Yandex Music's own r128
// metadata ({ i, tp }) and derives the gain as
// min(TARGET_LUFS - i, -tp) dB. PulseSync patches the site bundle
// directly; here the gain node is inserted at runtime by
// r128NormalizationPatcher in mainWindow/preload.cjs, and this script
// only feeds it the current track's r128 values.

(function () {
	"use strict";

	const UNKNOWN_R128 = { i: 0, tp: 0 };
	const WAIT_INTERVAL_MS = 250;
	const WAIT_ATTEMPTS = 120;

	function readR128(api) {
		const track = api.getCurrentTrack?.();
		const r128 = track?.r128;
		if (!r128 || !Number.isFinite(Number(r128.i))) return UNKNOWN_R128;
		return r128;
	}

	function start(api) {
		const r128 = window.__nmcR128;
		r128.setEnabled(true);

		const applyCurrent = () => {
			r128.apply(readR128(api), api.getActiveAudioElement?.() ?? null);
		};

		api.onTrackChange(applyCurrent);
		api.onAudioEvent?.((event) => {
			if (event?.type === "playing" || event?.type === "attach") {
				applyCurrent();
			}
		});
		applyCurrent();
	}

	let attempts = 0;
	const timer = setInterval(() => {
		const api = window.nextmusicApi;
		if (window.__nmcR128 && typeof api?.onTrackChange === "function") {
			clearInterval(timer);
			start(api);
			return;
		}
		if (++attempts >= WAIT_ATTEMPTS) clearInterval(timer);
	}, WAIT_INTERVAL_MS);
})();
