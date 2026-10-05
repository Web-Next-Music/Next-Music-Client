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
		if (radius && radius !== "0px") clipWrap.style.borderRadius = radius;
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
		const barWidth = (width - SPECTRUM_GAP * (bandCount - 1)) / bandCount;
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
