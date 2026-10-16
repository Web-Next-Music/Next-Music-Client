async function getTrackFileInfo(track) {
	const trackId = track?.id;
	if (!trackId) throw new Error("Current track ID is unavailable");
	if (!window.nmcDownloader?.getTrackFileInfo) {
		throw new Error("MP3 download resolver bridge is unavailable");
	}
	return window.nmcDownloader.getTrackFileInfo(String(trackId));
}
