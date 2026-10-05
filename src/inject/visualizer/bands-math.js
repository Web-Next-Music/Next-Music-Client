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
