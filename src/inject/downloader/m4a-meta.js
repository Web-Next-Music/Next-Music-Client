// M4A / iTunes metadata
function _concat(...bufs) {
	const total = bufs.reduce((s, b) => s + b.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const b of bufs) {
		out.set(b, pos);
		pos += b.length;
	}
	return out;
}

function _box(type, payload) {
	const size = 8 + payload.length;
	const out = new Uint8Array(size);
	out[0] = (size >>> 24) & 0xff;
	out[1] = (size >>> 16) & 0xff;
	out[2] = (size >>> 8) & 0xff;
	out[3] = size & 0xff;
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i) & 0xff;
	out.set(payload, 8);
	return out;
}

function _dataAtom(flags, data) {
	const size = 16 + data.length;
	const out = new Uint8Array(size);
	out[0] = (size >>> 24) & 0xff;
	out[1] = (size >>> 16) & 0xff;
	out[2] = (size >>> 8) & 0xff;
	out[3] = size & 0xff;
	out[4] = 0x64;
	out[5] = 0x61;
	out[6] = 0x74;
	out[7] = 0x61; // "data"
	out[9] = (flags >>> 16) & 0xff;
	out[10] = (flags >>> 8) & 0xff;
	out[11] = flags & 0xff;
	out.set(data, 16);
	return out;
}

function _textTag(fourcc, text) {
	return _box(fourcc, _dataAtom(1, _utf8(text)));
}

function _coverTag(imgData, mime) {
	return _box("covr", _dataAtom(mime === "image/png" ? 14 : 13, imgData));
}

function _hdlrBox() {
	// FullBox: version(1)+flags(3)+pre_defined(4)+handler_type(4)+reserved(12)+name\0(1)
	const p = new Uint8Array(25);
	p[8] = 0x6d;
	p[9] = 0x64;
	p[10] = 0x69;
	p[11] = 0x72; // "mdir"
	return _box("hdlr", p);
}

async function buildM4aMeta(track, cover) {
	const frames = [];
	if (track.title) frames.push(_textTag("\xA9nam", track.title));
	if (track.artistNames?.length)
		frames.push(_textTag("\xA9ART", track.artistNames.join(", ")));
	if (track.albumTitle) frames.push(_textTag("\xA9alb", track.albumTitle));
	if (track.year) frames.push(_textTag("\xA9day", String(track.year)));

	if (cover) frames.push(_coverTag(cover.data, cover.mime));

	if (!frames.length) return null;

	const ilst = _box("ilst", _concat(...frames));
	// meta is a FullBox: 4-byte version+flags prefix required
	const meta = _box("meta", _concat(new Uint8Array(4), _hdlrBox(), ilst));
	return _box("udta", meta);
}

// Update stco/co64 chunk offsets inside a moov buffer by delta bytes
function _updateChunkOffsets(buf, start, end, delta) {
	let pos = start;
	while (pos + 8 <= end) {
		const size =
			((buf[pos] << 24) |
				(buf[pos + 1] << 16) |
				(buf[pos + 2] << 8) |
				buf[pos + 3]) >>>
			0;
		if (size < 8) break;
		const type = String.fromCharCode(
			buf[pos + 4],
			buf[pos + 5],
			buf[pos + 6],
			buf[pos + 7],
		);
		const boxEnd = pos + size;
		if (type === "stco") {
			const count =
				((buf[pos + 12] << 24) |
					(buf[pos + 13] << 16) |
					(buf[pos + 14] << 8) |
					buf[pos + 15]) >>>
				0;
			for (let i = 0; i < count; i++) {
				const o = pos + 16 + i * 4;
				if (o + 4 > boxEnd) break;
				const v =
					((buf[o] << 24) |
						(buf[o + 1] << 16) |
						(buf[o + 2] << 8) |
						buf[o + 3]) >>>
					0;
				const nv = (v + delta) >>> 0;
				buf[o] = (nv >>> 24) & 255;
				buf[o + 1] = (nv >>> 16) & 255;
				buf[o + 2] = (nv >>> 8) & 255;
				buf[o + 3] = nv & 255;
			}
		} else if (type === "co64") {
			const count =
				((buf[pos + 12] << 24) |
					(buf[pos + 13] << 16) |
					(buf[pos + 14] << 8) |
					buf[pos + 15]) >>>
				0;
			for (let i = 0; i < count; i++) {
				const o = pos + 16 + i * 8;
				if (o + 8 > boxEnd) break;
				let hi =
					((buf[o] << 24) |
						(buf[o + 1] << 16) |
						(buf[o + 2] << 8) |
						buf[o + 3]) >>>
					0;
				let lo =
					((buf[o + 4] << 24) |
						(buf[o + 5] << 16) |
						(buf[o + 6] << 8) |
						buf[o + 7]) >>>
					0;
				lo += delta;
				if (lo > 0xffffffff) {
					hi++;
					lo -= 0x100000000;
				}
				buf[o] = (hi >>> 24) & 255;
				buf[o + 1] = (hi >>> 16) & 255;
				buf[o + 2] = (hi >>> 8) & 255;
				buf[o + 3] = hi & 255;
				buf[o + 4] = (lo >>> 24) & 255;
				buf[o + 5] = (lo >>> 16) & 255;
				buf[o + 6] = (lo >>> 8) & 255;
				buf[o + 7] = lo & 255;
			}
		} else if (["trak", "mdia", "minf", "stbl", "edts"].includes(type)) {
			_updateChunkOffsets(buf, pos + 8, boxEnd, delta);
		}
		pos = boxEnd;
	}
}

function injectM4aMeta(buf, udtaBox) {
	let moovStart = -1,
		moovEnd = -1,
		mdatStart = Infinity;
	let pos = 0;
	while (pos + 8 <= buf.length) {
		const size =
			((buf[pos] << 24) |
				(buf[pos + 1] << 16) |
				(buf[pos + 2] << 8) |
				buf[pos + 3]) >>>
			0;
		if (size === 0 || size < 8 || pos + size > buf.length) break;
		const type = String.fromCharCode(
			buf[pos + 4],
			buf[pos + 5],
			buf[pos + 6],
			buf[pos + 7],
		);
		if (type === "moov") {
			moovStart = pos;
			moovEnd = pos + size;
		}
		if (type === "mdat" && pos < mdatStart) mdatStart = pos;
		pos += size;
	}
	if (moovStart < 0) return buf;

	// Rebuild moov content, stripping any existing udta
	const moovContent = buf.subarray(moovStart + 8, moovEnd);
	let filtered = new Uint8Array(0);
	pos = 0;
	while (pos + 8 <= moovContent.length) {
		const size =
			((moovContent[pos] << 24) |
				(moovContent[pos + 1] << 16) |
				(moovContent[pos + 2] << 8) |
				moovContent[pos + 3]) >>>
			0;
		if (size < 8) break;
		const type = String.fromCharCode(
			moovContent[pos + 4],
			moovContent[pos + 5],
			moovContent[pos + 6],
			moovContent[pos + 7],
		);
		if (type !== "udta")
			filtered = _concat(filtered, moovContent.subarray(pos, pos + size));
		pos += size;
	}

	const newMoov = _box("moov", _concat(filtered, udtaBox));
	const delta = newMoov.length - (moovEnd - moovStart);

	if (moovStart < mdatStart && delta !== 0) {
		_updateChunkOffsets(newMoov, 8, newMoov.length, delta);
	}

	return _concat(buf.subarray(0, moovStart), newMoov, buf.subarray(moovEnd));
}
