function fnv1a(str) {
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h.toString(36);
}

function getShareableTrack() {
	const api = window.nextmusicApi;
	if (typeof api?.getCurrentTrack !== "function") return null;

	const track = api.getCurrentTrack();
	if (!track || !track.id) return null;

	const id = String(track.id);

	if (id.startsWith(UGC_PREFIX) || UUID_RE.test(id)) {
		const cached = ugcByTrackId.get(id);
		if (cached) return { trackId: id, ugc: cached };

		const url = api.getCurrentMp3Url?.();
		if (!url) return { trackId: id };

		const ugc = { u: url };
		if (track.title) ugc.t = track.title;
		if (track.artistNames?.[0]) ugc.a = track.artistNames[0];
		if (track.coverUrl) ugc.c = track.coverUrl;

		const trackId = id.startsWith(UGC_PREFIX)
			? id
			: UGC_PREFIX + fnv1a(url);
		ugcByTrackId.set(trackId, ugc);

		return { trackId, ugc };
	}

	return { trackId: id };
}

function getTrackId() {
	return getShareableTrack()?.trackId ?? null;
}

function getAlbumPath() {
	return getTrackId();
}

function forceSendCurrentTrack() {
	const p = getAlbumPath();
	if (!p || !isConnected()) return;

	lastSentPath = p;

	const message = { type: "navigate", trackId: p, roomId: ROOM_ID };
	const ugc = ugcByTrackId.get(p);
	if (p.startsWith(UGC_PREFIX) && ugc) message.ugc = ugc;

	const pos = getPosition();
	if (typeof pos === "number") message.position = pos;

	LA.send(message);
}
