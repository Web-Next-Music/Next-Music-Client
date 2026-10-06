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
	let elapsed = state.lastTime == null ? 1 / 60 : (now - state.lastTime) / 1000;
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
