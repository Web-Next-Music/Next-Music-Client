// MP3 encoding: ffmpeg via IPC (fast), fallback to lamejs (pure JS)
async function encodeToMp3(audioBuf, onProgress) {
	onProgress?.(0);

	if (window.nmcConvert?.mp3) {
		const slice = audioBuf.buffer.slice(
			audioBuf.byteOffset,
			audioBuf.byteOffset + audioBuf.byteLength,
		);
		const unsubProgress = window.nmcConvert.onProgress?.((p) =>
			onProgress?.(p),
		);
		try {
			const result = await window.nmcConvert.mp3(slice);
			if (result) {
				onProgress?.(1);
				return new Uint8Array(result);
			}
		} finally {
			unsubProgress?.();
		}
	}

	// lamejs fallback
	const ctx = new AudioContext();
	let audioBuffer;
	try {
		const ab = audioBuf.buffer.slice(
			audioBuf.byteOffset,
			audioBuf.byteOffset + audioBuf.byteLength,
		);
		audioBuffer = await ctx.decodeAudioData(ab);
	} finally {
		ctx.close();
	}

	const channels = Math.min(audioBuffer.numberOfChannels, 2);
	const encoder = new lamejs.Mp3Encoder(
		channels,
		audioBuffer.sampleRate,
		128,
	);

	const leftFloat = audioBuffer.getChannelData(0);
	const rightFloat = channels > 1 ? audioBuffer.getChannelData(1) : leftFloat;

	function toInt16(f32) {
		const out = new Int16Array(f32.length);
		for (let i = 0; i < f32.length; i++) {
			const s = Math.max(-1, Math.min(1, f32[i]));
			out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		return out;
	}

	const left = toInt16(leftFloat);
	const right = toInt16(rightFloat);

	const BLOCK = 1152;
	const total = left.length;
	const parts = [];

	onProgress?.(0);
	for (let i = 0; i < total; i += BLOCK) {
		const buf = encoder.encodeBuffer(
			left.subarray(i, i + BLOCK),
			right.subarray(i, i + BLOCK),
		);
		if (buf.length > 0) parts.push(new Uint8Array(buf));
		if (i % (BLOCK * 64) === 0) {
			onProgress?.(i / total);
			await new Promise((r) => setTimeout(r, 0));
		}
	}

	const end = encoder.flush();
	if (end.length > 0) parts.push(new Uint8Array(end));
	onProgress?.(1);

	const size = parts.reduce((a, p) => a + p.length, 0);
	const out = new Uint8Array(size);
	let pos = 0;
	for (const p of parts) {
		out.set(p, pos);
		pos += p.length;
	}
	return out;
}
