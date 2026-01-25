(function () {
    "use strict";

    const targetRMS = 0.015; // целевой уровень громкости
    const minGain = 0.015; // старт почти выключен
    const maxGain = 10; // максимальный gain
    const smoothing = 0.015; // EMA для RMS
    const attack = 0.001; // скорость увеличения громкости (медленнее)
    const release = 0.2; // скорость снижения громкости (быстрее)

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

                // Асимметричное сглаживание gain
                if (desiredGain > gainNode.gain.value) {
                    // увеличение — медленно
                    gainNode.gain.value +=
                        (desiredGain - gainNode.gain.value) * attack;
                } else {
                    // уменьшение — быстро
                    gainNode.gain.value +=
                        (desiredGain - gainNode.gain.value) * release;
                }

                requestAnimationFrame(normalize);
            }

            setTimeout(normalize, 50);

            return gainNode;
        };

        return ctx;
    };

    console.log(
        "✅ Page-wide audio normalizer active (asymmetric gain: fast down, slow up)",
    );
})();
