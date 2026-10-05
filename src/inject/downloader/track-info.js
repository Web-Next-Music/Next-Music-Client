// Getting audio URL and decryption key via the players captured file info
async function getTrackFileInfo() {
	const url = window.nextmusicApi?.getCurrentMp3Url?.();
	if (!url) throw new Error("Audio URL not available - play the track first");
	const keyHex = window.nextmusicApi?.getCurrentTrackKey?.() ?? "";
	return { url, keyHex };
}
