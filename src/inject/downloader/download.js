// Downloading
async function fetchWithProgress(url, onProgress) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Audio download error: HTTP ${res.status}`);

	const contentLength = res.headers.get("Content-Length");
	if (!contentLength || !res.body)
		return new Uint8Array(await res.arrayBuffer());

	const total = parseInt(contentLength, 10);
	const reader = res.body.getReader();
	const chunks = [];
	let received = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.length;
		onProgress?.(received / total);
	}

	const out = new Uint8Array(received);
	let pos = 0;
	for (const chunk of chunks) {
		out.set(chunk, pos);
		pos += chunk.length;
	}
	return out;
}

async function downloadTrack(track, onProgress) {
	const { url: audioUrl, keyHex } = await getTrackFileInfo();

	const coverPromise = fetchAndResizeCover(track.coverUrl);
	let audioBuf = await fetchWithProgress(audioUrl, (r) =>
		onProgress?.("download", r),
	);

	if (keyHex) audioBuf = await decryptAesCtr(audioBuf, keyHex);

	const isMp3 = detectIsMp3(audioBuf);
	let output;
	if (isMp3) {
		const cover = await coverPromise;
		const id3Tag = await buildId3Tag(track, cover);
		let audioStart = 0;
		if (
			audioBuf[0] === 0x49 &&
			audioBuf[1] === 0x44 &&
			audioBuf[2] === 0x33
		) {
			const existingSize =
				((audioBuf[6] & 0x7f) << 21) |
				((audioBuf[7] & 0x7f) << 14) |
				((audioBuf[8] & 0x7f) << 7) |
				(audioBuf[9] & 0x7f);
			audioStart = 10 + existingSize;
		}
		output = new Uint8Array(id3Tag.length + audioBuf.length - audioStart);
		output.set(id3Tag, 0);
		output.set(audioBuf.subarray(audioStart), id3Tag.length);
	} else {
		const [mp3Raw, cover] = await Promise.all([
			encodeToMp3(audioBuf, (r) => onProgress?.("convert", r)),
			coverPromise,
		]);
		const id3Tag = await buildId3Tag(track, cover);
		output = new Uint8Array(id3Tag.length + mp3Raw.length);
		output.set(id3Tag, 0);
		output.set(mp3Raw, id3Tag.length);
	}

	const artist = sanitize(
		track.artistNames?.length ? track.artistNames.join(", ") : "Unknown",
	);
	const title = sanitize(track.title ?? "track");
	const filename = `${artist} - ${title}.mp3`;

	const blob = new Blob([output], { type: "audio/mpeg" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
