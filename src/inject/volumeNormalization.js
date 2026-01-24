(function () {
    "use strict";

    const targetRMS = 0.01; // целевой уровень громкости
    const minGain = 0.01; // минимальный gain, чтобы звук изначально почти выключен
    const maxGain = 10; // максимальный gain
    const smoothing = 0.05; // EMA для RMS

    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = function (...args) {
        const ctx = new OriginalAudioContext(...args);

        const originalCreateGain = ctx.createGain.bind(ctx);
        ctx.createGain = function () {
            const gainNode = originalCreateGain();

            // Старт полностью почти выключен
            gainNode.gain.value = minGain;

            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            const dataArray = new Uint8Array(analyser.fftSize);

            // Подключаем gainNode к analyser и далее к destination
            gainNode.connect(analyser);
            analyser.connect(ctx.destination);

            let avgRMS = targetRMS;

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

                // Вычисляем нормализованную громкость
                let desiredGain = targetRMS / (avgRMS || 0.0001);
                desiredGain = Math.max(minGain, Math.min(maxGain, desiredGain));

                // Устанавливаем gain мгновенно каждый кадр
                gainNode.gain.setValueAtTime(desiredGain, ctx.currentTime);

                requestAnimationFrame(normalize);
            }

            normalize();

            return gainNode;
        };

        return ctx;
    };

    console.log(
        "✅ Page-wide audio normalizer active (immediate, minGain 0.01)",
    );
})();
