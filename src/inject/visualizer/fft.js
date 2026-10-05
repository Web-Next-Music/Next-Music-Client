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
