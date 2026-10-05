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

	// Winamp's classic FFT (`classic_vis.cpp`), ported from Spotifast's
	// src/vis.rs: bit-reversal permutation, Hann-style envelope, iterative
	// radix-2 Cooley-Tukey, magnitudes over the lower half of the spectrum.
	class Fft {
		constructor(n) {
			this.n = n;
			this.bitReversed = new Uint32Array(n);
			for (let i = 0; i < n; i++) this.bitReversed[i] = i;
			let j = 0;
			for (let i = 0; i < n; i++) {
				if (j > i) {
					const tmp = this.bitReversed[i];
					this.bitReversed[i] = this.bitReversed[j];
					this.bitReversed[j] = tmp;
				}
				let m = n >> 1;
				while (m >= 1 && j >= m) {
					j -= m;
					m >>= 1;
				}
				j += m;
			}

			this.envelope = new Float32Array(n);
			for (let i = 0; i < n; i++) {
				const phase = (i / n) * Math.PI * 2;
				this.envelope[i] = 0.5 + 0.5 * Math.sin(phase - Math.PI / 2);
			}

			this.twiddles = [];
			for (let size = 2; size <= n; size <<= 1) {
				const theta = (-Math.PI * 2) / size;
				this.twiddles.push([Math.cos(theta), Math.sin(theta)]);
			}

			this.real = new Float32Array(n);
			this.imaginary = new Float32Array(n);
		}

		spectrum(wave, out) {
			const n = this.n;
			const { bitReversed, envelope, real, imaginary, twiddles } = this;
			for (let i = 0; i < n; i++) {
				const from = bitReversed[i];
				real[i] = (wave[from] ?? 0) * envelope[from];
				imaginary[i] = 0;
			}

			let size = 2;
			let stage = 0;
			while (size <= n) {
				const [wpr, wpi] = twiddles[stage];
				let wr = 1;
				let wi = 0;
				const half = size >> 1;
				for (let m = 0; m < half; m++) {
					let i = m;
					while (i < n) {
						const j = i + half;
						const tr = wr * real[j] - wi * imaginary[j];
						const ti = wr * imaginary[j] + wi * real[j];
						real[j] = real[i] - tr;
						imaginary[j] = imaginary[i] - ti;
						real[i] += tr;
						imaginary[i] += ti;
						i += size;
					}
					const previous = wr;
					wr = wr * wpr - wi * wpi;
					wi = wi * wpr + previous * wpi;
				}
				size <<= 1;
				stage += 1;
			}

			for (let i = 0; i < out.length; i++) {
				out[i] =
					Math.sqrt(real[i] * real[i] + imaginary[i] * imaginary[i]) *
					SPEC_SCALE;
			}
		}
	}

	function warp(x) {
		return (2 ** (x / 12) - 1) * BLA;
	}

	function sampleAt(spectrum, index) {
		return index >= 0 && index < spectrum.length ? spectrum[index] : 0;
	}

	function hermite(x, y0, y1, y2, y3) {
		const c1 = 0.5 * (y2 - y0);
		const c3 = 1.5 * (y1 - y2) + 0.5 * (y3 - y0);
		const c2 = y0 - y1 + c1 - c3;
		return ((c3 * x + c2) * x + c1) * x + y1;
	}

	// Winamp's bands over a 256-bin spectrum: seventy-five spans a semitone
	// apart, each summing its share of the bins through a Hermite curve,
	// clipped at 255.
	function bands(spectrum, out) {
		let next = warp(0) + 1;
		for (let x = 0; x < WIDE_BANDS; x++) {
			const low = next;
			next = warp(x + 1) + 1;
			let value = 0;
			let bin = Math.floor(low);
			const end = Math.min(Math.floor(next), spectrum.length - 1);
			let fraction = low;
			let mult = bin + 1 - low;
			let herm = true;
			for (;;) {
				if (bin === end) {
					mult = next - fraction;
					herm = true;
				}
				if (herm) {
					value +=
						hermite(
							fraction - bin,
							sampleAt(spectrum, Math.max(bin - 1, 0)),
							sampleAt(spectrum, bin),
							sampleAt(spectrum, bin + 1),
							sampleAt(spectrum, bin + 2),
						) * mult;
				} else {
					value += sampleAt(spectrum, bin);
				}
				herm = false;
				bin += 1;
				if (bin > end) break;
				fraction = bin;
			}
			out[x] = Math.min(value, 255);
		}
		return out;
	}

	function makeAnalyserState(bands) {
		return {
			levels: new Float32Array(bands),
			peaks: new Float32Array(bands),
			held: new Float32Array(bands),
			speed: new Float32Array(bands),
			lastTime: null,
		};
	}

	function stepAnalyser(state, columns, now) {
		let elapsed =
			state.lastTime == null ? 1 / 60 : (now - state.lastTime) / 1000;
		elapsed = Math.min(elapsed, 0.25);
		state.lastTime = now;

		for (let i = 0; i < columns.length; i++) {
			const target = Math.min(columns[i], MAX_HEIGHT) / MAX_HEIGHT;
			let level = state.levels[i] - WIDE_FALL * elapsed;
			level = Math.max(level, target);
			if (level < 0.01) level = 0;
			state.levels[i] = level;

			if (level >= state.peaks[i]) {
				state.peaks[i] = level;
				state.held[i] = 0;
				state.speed[i] = 0;
			} else if (state.held[i] < PEAK_HOLD) {
				state.held[i] += elapsed;
			} else {
				state.speed[i] += PEAK_GRAVITY * elapsed;
				state.peaks[i] = Math.max(
					state.peaks[i] - state.speed[i] * elapsed,
					level,
				);
			}
			if (state.peaks[i] < 0.01) state.peaks[i] = 0;
		}

		return { levels: state.levels, peaks: state.peaks };
	}

	function accentColor(img) {
		const canvas = document.createElement("canvas");
		canvas.width = 48;
		canvas.height = 48;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		ctx.drawImage(img, 0, 0, 48, 48);

		let data;
		try {
			data = ctx.getImageData(0, 0, 48, 48).data;
		} catch {
			return null;
		}

		const buckets = new Map();
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];

			const max = Math.max(r, g, b);
			const min = Math.min(r, g, b);
			const saturation = max === 0 ? 0 : (max - min) / max;
			const lightness = (max + min) / 510;
			const weight =
				(1 + saturation * 6) *
				Math.max(1 - Math.abs(lightness - 0.5) * 1.4, 0.05);

			const key = `${r >> 4},${g >> 4},${b >> 4}`;
			let bucket = buckets.get(key);
			if (!bucket) {
				bucket = { weight: 0, r: 0, g: 0, b: 0 };
				buckets.set(key, bucket);
			}
			bucket.weight += weight;
			bucket.r += r * weight;
			bucket.g += g * weight;
			bucket.b += b * weight;
		}

		let best = null;
		for (const bucket of buckets.values()) {
			if (!best || bucket.weight > best.weight) best = bucket;
		}
		if (!best || best.weight === 0) return null;

		return [
			Math.round(best.r / best.weight),
			Math.round(best.g / best.weight),
			Math.round(best.b / best.weight),
		];
	}

	function rgbToHsv([r, g, b]) {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const d = max - min;
		let h = 0;
		if (d !== 0) {
			if (max === r) h = ((g - b) / d) % 6;
			else if (max === g) h = (b - r) / d + 2;
			else h = (r - g) / d + 4;
			h /= 6;
			if (h < 0) h += 1;
		}
		const s = max === 0 ? 0 : d / max;
		return { h, s, v: max };
	}

	function hsvToRgb(h, s, v) {
		const i = Math.floor(h * 6);
		const f = h * 6 - i;
		const p = v * (1 - s);
		const q = v * (1 - f * s);
		const t = v * (1 - (1 - f) * s);
		let r, g, b;
		switch (i % 6) {
			case 0:
				r = v;
				g = t;
				b = p;
				break;
			case 1:
				r = q;
				g = v;
				b = p;
				break;
			case 2:
				r = p;
				g = v;
				b = t;
				break;
			case 3:
				r = p;
				g = q;
				b = v;
				break;
			case 4:
				r = t;
				g = p;
				b = v;
				break;
			default:
				r = v;
				g = p;
				b = q;
				break;
		}
		return [r * 255, g * 255, b * 255];
	}

	function keepBrightness([r, g, b], dark) {
		const { h, s, v } = rgbToHsv([r, g, b]);
		const minV = dark ? 0.55 : 0.35;
		const maxV = dark ? 1.0 : 0.75;
		const clamped = Math.min(Math.max(v, minV), maxV);
		return hsvToRgb(h, s, clamped);
	}

	function visColours(baseRgb, dark) {
		const { h } = rgbToHsv(baseRgb);
		const lowHsv = rgbToHsv(baseRgb);
		const low = hsvToRgb(h, Math.max(lowHsv.s, 0.55), 1);
		const high = hsvToRgb((h + 1 / 6) % 1, Math.max(lowHsv.s, 0.55), 1);
		return [keepBrightness(low, dark), keepBrightness(high, dark)];
	}

	function tintFromArt([r, g, b], dark) {
		const max = Math.max(r, g, b) / 255;
		const min = Math.min(r, g, b) / 255;
		const lightness = (max + min) / 2;
		const target = dark ? 0.3 : 0.72;
		if (lightness < 0.01) {
			const v = target * 255;
			return [v, v, v];
		}
		const scale = target / lightness;
		return [
			Math.min((r / 255) * scale, 1) * 255,
			Math.min((g / 255) * scale, 1) * 255,
			Math.min((b / 255) * scale, 1) * 255,
		];
	}

	function lerpColour(a, b, t) {
		return [
			a[0] + (b[0] - a[0]) * t,
			a[1] + (b[1] - a[1]) * t,
			a[2] + (b[2] - a[2]) * t,
		];
	}

	function rgba([r, g, b], alpha) {
		return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${Math.max(0, Math.min(1, alpha))})`;
	}

	function isDarkTheme() {
		return document.body?.classList?.contains("ym-dark-theme") ?? true;
	}

	function drawShadedRect(ctx, x, y, w, h, topColour, bottomColour) {
		if (w <= 0 || h <= 0) return;
		const gradient = ctx.createLinearGradient(x, y, x, y + h);
		gradient.addColorStop(0, topColour);
		gradient.addColorStop(1, bottomColour);
		ctx.fillStyle = gradient;
		ctx.fillRect(x, y, w, h);
	}

	function createVisualizer() {
		let canvas = null;
		let ctx = null;
		let container = null;
		let clipWrap = null;
		let analyserState = null;
		let fft = null;
		let waveBuf = null;
		let spectrumBuf = null;
		let columnsBuf = null;
		let rafId = null;

		let currentAccent = [120, 120, 220];
		let accentOverride = null;
		let targetTint = tintFromArt(currentAccent, isDarkTheme());
		let fromTint = targetTint;
		let tintStart = null;

		let currentUrl = null;
		let analyserNode = null;
		let apiRef = null;
		let resizeObserver = null;

		function activeAccent() {
			return accentOverride ?? currentAccent;
		}

		function parseAccentInput(input) {
			if (Array.isArray(input) && input.length >= 3) {
				const [r, g, b] = input;
				if ([r, g, b].every((n) => Number.isFinite(n)))
					return [r, g, b].map((n) => Math.max(0, Math.min(255, n)));
				return null;
			}
			if (typeof input === "string") {
				const hex = input.trim().replace(/^#/, "");
				const full =
					hex.length === 3
						? hex
								.split("")
								.map((c) => c + c)
								.join("")
						: hex;
				if (!/^[0-9a-f]{6}$/i.test(full)) return null;
				return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
			}
			return null;
		}

		function retintTo(rgb) {
			fromTint = currentTint();
			targetTint = tintFromArt(rgb, isDarkTheme());
			tintStart = performance.now();
		}

		function setAccentOverride(input) {
			const rgb = parseAccentInput(input);
			if (!rgb) return false;
			accentOverride = rgb;
			retintTo(rgb);
			return true;
		}

		function clearAccentOverride() {
			if (!accentOverride) return;
			accentOverride = null;
			retintTo(currentAccent);
		}

		function findMainPlayerBar() {
			const candidate = document.querySelector(".PlayerBar_root__cXUnU");
			if (!candidate || candidate.closest('[class*="Vibe"]')) return null;
			return candidate;
		}

		function ensureCanvas() {
			if (canvas && !canvas.isConnected) {
				clipWrap?.remove();
				clipWrap = null;
				canvas = null;
				ctx = null;
				resizeObserver?.disconnect();
				resizeObserver = null;
			}
			if (canvas || !apiRef) return;

			container = findMainPlayerBar();
			if (!container) return;

			clipWrap = document.createElement("div");
			clipWrap.id = "nmc-visualizer-clip";

			canvas = document.createElement("canvas");
			canvas.id = "nmc-visualizer-canvas";
			clipWrap.append(canvas);
			container.prepend(clipWrap);
			ctx = canvas.getContext("2d");

			resize();
			window.addEventListener("resize", resize);

			if (typeof ResizeObserver === "function") {
				resizeObserver = new ResizeObserver(resize);
				resizeObserver.observe(container);
			}
		}

		function resize() {
			if (!canvas || !container) return;
			const rect = container.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.max(1, Math.floor(rect.width * dpr));
			canvas.height = Math.max(1, Math.floor(rect.height * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			const radius = getComputedStyle(container).borderRadius;
			if (radius && radius !== "0px")
				clipWrap.style.borderRadius = radius;
		}

		function syncAnalyser() {
			const analyser = window.__nmcVis?.getAnalyser?.();
			if (!analyser || analyser === analyserNode) return;

			analyserNode = analyser;
			analyserNode.fftSize = FFT_SAMPLES;
			fft = new Fft(FFT_SAMPLES);
			waveBuf = new Float32Array(FFT_SAMPLES);
			spectrumBuf = new Float32Array(SPECTRUM_BINS);
			columnsBuf = new Float32Array(WIDE_BANDS);
			analyserState = makeAnalyserState(WIDE_BANDS);
		}

		function syncAccent(api) {
			const track = api.getCurrentTrack?.();
			const url = track?.coverUrl;
			if (!url || url === currentUrl) return;
			currentUrl = url;

			const img = new Image();
			img.crossOrigin = "anonymous";
			img.onload = () => {
				const rgb = accentColor(img);
				if (!rgb) return;
				currentAccent = rgb;
				if (!accentOverride) retintTo(rgb);
			};
			img.src = url;
		}

		function currentTint() {
			if (tintStart == null) return targetTint;
			const t = Math.min(
				(performance.now() - tintStart) / 1000 / TINT_FADE_SECONDS,
				1,
			);
			return lerpColour(fromTint, targetTint, t);
		}

		function draw(now) {
			rafId = requestAnimationFrame(draw);
			if (!canvas || !canvas.isConnected) ensureCanvas();
			if (!canvas || !ctx) return;

			const dark = isDarkTheme();
			const width = canvas.width / (window.devicePixelRatio || 1);
			const height = canvas.height / (window.devicePixelRatio || 1);
			ctx.clearRect(0, 0, width, height);

			const tint = currentTint();
			ctx.fillStyle = rgba(tint, dark ? 0.55 : 0.35);
			ctx.fillRect(0, 0, width, height);

			if (!analyserNode || !analyserState) return;

			analyserNode.getFloatTimeDomainData(waveBuf);
			for (let i = 0; i < waveBuf.length; i++) waveBuf[i] *= CHANNEL_SUM;
			fft.spectrum(waveBuf, spectrumBuf);
			const columns = bands(spectrumBuf, columnsBuf);
			const { levels, peaks } = stepAnalyser(analyserState, columns, now);

			const strength = dark ? 1.0 : 1.5;
			const [low, high] = visColours(activeAccent(), dark);

			const bandCount = levels.length;
			const barWidth =
				(width - SPECTRUM_GAP * (bandCount - 1)) / bandCount;
			const reach = height - PEAK_GAP - PEAK_HEIGHT - 1;

			let bass = 0;
			const bassBands = Math.max(1, Math.floor(bandCount / 8));
			for (let i = 0; i < bassBands; i++) bass += levels[i];
			bass /= bassBands;

			drawShadedRect(
				ctx,
				0,
				height / 2,
				width,
				height / 2,
				rgba(low, 0),
				rgba(low, PULSE_ALPHA * strength * bass * bass),
			);

			for (let i = 0; i < bandCount; i++) {
				const left = i * (barWidth + SPECTRUM_GAP);
				const colour = lerpColour(low, high, i / (bandCount - 1));
				const barHeight = levels[i] * reach;

				if (barHeight >= 1) {
					const top = height - barHeight;
					drawShadedRect(
						ctx,
						left - SPECTRUM_GAP,
						top - 3,
						barWidth + SPECTRUM_GAP * 2,
						barHeight + 6,
						rgba(colour, GLOW_ALPHA * strength * 0.3),
						rgba(colour, GLOW_ALPHA * strength),
					);

					const foot = SPECTRUM_ALPHA[0] * strength;
					const peakAlpha = SPECTRUM_ALPHA[1] * strength;
					drawShadedRect(
						ctx,
						left,
						top,
						barWidth,
						barHeight,
						rgba(colour, foot + (peakAlpha - foot) * levels[i]),
						rgba(colour, foot),
					);
				}

				const cap = peaks[i] * reach;
				if (cap >= 2) {
					const y = height - cap - PEAK_GAP;
					ctx.fillStyle = rgba(colour, PEAK_ALPHA);
					ctx.fillRect(left, y - PEAK_HEIGHT, barWidth, PEAK_HEIGHT);
				}
			}
		}

		function start(api) {
			apiRef = api;
			ensureCanvas();
			syncAccent(api);
			syncAnalyser();

			api.onTrackChange?.(() => {
				syncAccent(api);
				syncAnalyser();
			});
			api.onAudioEvent?.((event) => {
				if (event?.type === "playing" || event?.type === "attach") {
					syncAnalyser();
				}
			});
			setInterval(syncAnalyser, 1000);

			if (rafId == null) rafId = requestAnimationFrame(draw);
		}

		function stop() {
			if (rafId != null) cancelAnimationFrame(rafId);
			rafId = null;
			window.removeEventListener("resize", resize);
			resizeObserver?.disconnect();
			resizeObserver = null;
			clipWrap?.remove();
			clipWrap = null;
			canvas = null;
		}

		return { start, stop, setAccentOverride, clearAccentOverride };
	}

	const visualizer = createVisualizer();

	window.NextMusicVisualizer = {
		setAccentColor: (color) => visualizer.setAccentOverride(color),
		clearAccentColor: () => visualizer.clearAccentOverride(),
	};

	const timer = setInterval(() => {
		const api = window.nextmusicApi;
		if (window.__nmcVis && typeof api?.onTrackChange === "function") {
			clearInterval(timer);
			visualizer.start(api);
		}
	}, WAIT_INTERVAL_MS);
})();
