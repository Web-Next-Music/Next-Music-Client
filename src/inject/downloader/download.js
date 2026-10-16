async function downloadTrack(track, onProgress) {
	if (!track?.id) throw new Error("Current track ID is unavailable");
	const coverPromise = fetchAndResizeCover(track.coverUrl);
	onProgress?.("download", 0);
	const audioBuf = new Uint8Array(
		await window.nmcDownloader.getTrackAudio(String(track.id)),
	);
	onProgress?.("download", 1);

	const cover = await coverPromise;
	const id3Tag = await buildId3Tag(track, cover);
	let audioStart = 0;
	if (
		audioBuf.length >= 10 &&
		audioBuf[0] === 0x49 &&
		audioBuf[1] === 0x44 &&
		audioBuf[2] === 0x33
	) {
		const size =
			((audioBuf[6] & 0x7f) << 21) |
			((audioBuf[7] & 0x7f) << 14) |
			((audioBuf[8] & 0x7f) << 7) |
			(audioBuf[9] & 0x7f);
		audioStart = 10 + size + (audioBuf[5] & 0x10 ? 10 : 0);
		if (audioStart > audioBuf.length) throw new Error("Invalid MP3 ID3 tag");
	}
	const output = new Uint8Array(id3Tag.length + audioBuf.length - audioStart);
	output.set(id3Tag);
	output.set(audioBuf.subarray(audioStart), id3Tag.length);

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
