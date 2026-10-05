// Spectrum rendering ported from Spotifast (native Rust/egui app,
// src/ui/player_bar.rs + src/vis.rs + src/images.rs + src/theme.rs):
// semitone-spaced FFT bands with time-based falloff/peak-hold physics,
// a weighted dominant-color histogram over the album art for the
// bass/treble hue sweep, and gradient bar/glow/peak-cap/pulse layers
// drawn on a canvas behind the player bar.

(function () {
	"use strict";

	const FFT_SAMPLES = 512;
	const SPECTRUM_BINS = FFT_SAMPLES / 2;
	const WIDE_BANDS = 75;
	const MAX_HEIGHT = 15;
	const FALLOFF = 12 / 16;
	const WIDE_FALL = (FALLOFF * 60) / MAX_HEIGHT;
	const PEAK_HOLD = 0.35;
	const PEAK_GRAVITY = 2.4;
	const CHANNEL_SUM = 2.0;
	const SPEC_SCALE = 0.5;
	const BLA = 255 / 2 ** (75 / 12);

	const SPECTRUM_ALPHA = [0.28, 0.08];
	const GLOW_ALPHA = 0.12;
	const PEAK_ALPHA = 0.7;
	const PULSE_ALPHA = 0.35;
	const PEAK_HEIGHT = 2;
	const PEAK_GAP = 2;
	const SPECTRUM_GAP = 2;

	const TINT_FADE_SECONDS = 0.45;

	const WAIT_INTERVAL_MS = 250;
