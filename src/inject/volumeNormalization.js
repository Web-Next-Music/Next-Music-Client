(function () {
	"use strict";

	const targetRMS = 0.015; // target loudness level
	const minGain = 0.015; // start nearly silent
	const maxGain = 10; // maximum gain
	const smoothing = 0.015; // EMA for RMS
	const attack = 0.001; // rate of gain increase (slower)
	const release = 0.2; // rate of gain decrease (faster)

	const OriginalAudioContext = window.AudioContext;
	window.AudioContext = function (...args) {
		const ctx = new OriginalAudioContext(...args);

		const originalCreateGain = ctx.createGain.bind(ctx);
		ctx.createGain = function () {
			const gainNode = originalCreateGain();
			gainNode.gain.value = minGain;

			const analyser = ctx.createAnalyser();
			analyser.fftSize = 2048;
			const dataArray = new Uint8Array(analyser.fftSize);

			gainNode.connect(analyser);
			analyser.connect(ctx.destination);

			let avgRMS = 0;

			function getRMS() {
				analyser.getByteTimeDomainData(dataArray);
				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					const val = (dataArray[i] - 128) / 128;
					sum += val * val;
				}
				return Math.sqrt(sum / dataArray.length);
			}

			function normalize() {
				const rms = getRMS();
				avgRMS = smoothing * rms + (1 - smoothing) * avgRMS;

				let desiredGain = targetRMS / (avgRMS || 0.0001);
				desiredGain = Math.max(minGain, Math.min(maxGain, desiredGain));

				if (desiredGain > gainNode.gain.value) {
					gainNode.gain.value += (desiredGain - gainNode.gain.value) * attack;
				} else {
					gainNode.gain.value += (desiredGain - gainNode.gain.value) * release;
				}

				requestAnimationFrame(normalize);
			}

			setTimeout(normalize, 50);

			return gainNode;
		};

		return ctx;
	};

	console.log(
		"Page-wide audio normalizer active (asymmetric gain: fast down, slow up)",
	);
})();
