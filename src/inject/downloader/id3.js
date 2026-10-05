// ID3v2.3
function _id3Frame(id, data) {
	const buf = new Uint8Array(10 + data.length);
	const view = new DataView(buf.buffer);
	buf.set(_utf8(id), 0);
	view.setUint32(4, data.length, false);
	buf.set(data, 10);
	return buf;
}

function _textFrame(id, text) {
	const tb = _utf8(text);
	const d = new Uint8Array(1 + tb.length);
	d[0] = 3; // UTF-8
	d.set(tb, 1);
	return _id3Frame(id, d);
}

async function buildId3Tag(track, cover) {
	const frames = [];

	if (track.title) frames.push(_textFrame("TIT2", track.title));
	if (track.artistNames?.[0])
		frames.push(_textFrame("TPE1", track.artistNames[0]));
	if (track.albumTitle) frames.push(_textFrame("TALB", track.albumTitle));
	if (track.year) frames.push(_textFrame("TYER", String(track.year)));

	if (cover) {
		const mimeBytes = _utf8(cover.mime);
		const apic = new Uint8Array(
			1 + mimeBytes.length + 1 + 1 + 1 + cover.data.length,
		);
		let p = 0;
		apic[p++] = 0;
		apic.set(mimeBytes, p);
		p += mimeBytes.length;
		apic[p++] = 0;
		apic[p++] = 3; // Cover (front)
		apic[p++] = 0;
		apic.set(cover.data, p);
		frames.push(_id3Frame("APIC", apic));
	}

	const framesSize = frames.reduce((a, f) => a + f.length, 0);
	const hdr = new Uint8Array(10);
	hdr[0] = 0x49;
	hdr[1] = 0x44;
	hdr[2] = 0x33; // "ID3"
	hdr[3] = 3;
	hdr[4] = 0;
	hdr[5] = 0; // v2.3, flags=0

	let sz = framesSize;
	hdr[9] = sz & 0x7f;
	sz >>= 7;
	hdr[8] = sz & 0x7f;
	sz >>= 7;
	hdr[7] = sz & 0x7f;
	sz >>= 7;
	hdr[6] = sz & 0x7f;

	const tag = new Uint8Array(10 + framesSize);
	tag.set(hdr, 0);
	let off = 10;
	for (const f of frames) {
		tag.set(f, off);
		off += f.length;
	}
	return tag;
}
