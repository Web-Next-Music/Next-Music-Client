(function () {
	const DL_BTN_ID = "nm-download-btn";
	const COVER_SIZE = 1000;
	window.nextmusicApi;

	const DL_ICON_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"
  aria-hidden="true" focusable="false" role="img" class="svg-icon">
  <use xlink:href="/icons/sprite.svg#download_xxs"/>
</svg>`;

	const DL_SPINNER_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"
  aria-hidden="true" focusable="false" class="nm-dl-spinner">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-dasharray="42 14" />
</svg>`;

	const DL_BTN_STYLE = `
#nm-download-btn {
  color: var(--ym-controls-color-secondary-text-enabled);
  background: transparent;
  border: 0 solid;
  z-index: 1;
  position: relative;
  overflow: visible;
}
#nm-download-btn:hover {
  color: var(--ym-controls-color-secondary-on_default-hovered);
  cursor: pointer;
}
#nm-download-btn:disabled {
  opacity: 1;
  cursor: default;
}
@keyframes nm-spin {
  to { transform: rotate(360deg); }
}
.nm-dl-spinner {
  display: block;
  animation: nm-spin 0.9s linear infinite;
  transform-origin: center;
}
#nm-dl-progress-track {
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 100%;
  height: 2px;
  background: currentColor;
  opacity: 0.2;
  border-radius: 1px;
}
#nm-dl-progress-fill {
  position: absolute;
  bottom: -4px;
  left: 0;
  width: 0%;
  height: 2px;
  background: currentColor;
  border-radius: 1px;
  transition: width 0.12s ease;
}
`;

	(function injectStyles() {
		const s = document.createElement("style");
		s.textContent = DL_BTN_STYLE;
		document.head.appendChild(s);
	})();

	let lastTrackId = null;

	// Utilities
	const _utf8 = (s) => new TextEncoder().encode(s);

	function sanitize(name) {
		return (name ?? "").replace(/[/\\?%*:|"<>]/g, "_");
	}

	function showError(msg) {
		window.nextmusicApi?.showErrorToast?.(
			msg,
			window.nextmusicApi.ContainerId?.ERROR,
		);
	}

	// Getting audio URL and decryption key via the players captured file info
	async function getTrackFileInfo() {
		const url = window.nextmusicApi?.getCurrentMp3Url?.();
		if (!url) throw new Error("Audio URL not available - play the track first");
		const keyHex = window.nextmusicApi?.getCurrentTrackKey?.() ?? "";
		return { url, keyHex };
	}

	// Detect audio format from magic bytes
	function detectIsMp3(buf) {
		if (
			buf.length >= 8 &&
			buf[4] === 0x66 &&
			buf[5] === 0x74 &&
			buf[6] === 0x79 &&
			buf[7] === 0x70
		)
			return false;
		return true; // ID3, raw MPEG frame, or unknown → treat as MP3
	}

	// AES-128-CTR decryption via Web Crypto API
	function hexToBytes(hex) {
		return new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));
	}

	async function decryptAesCtr(data, keyHex) {
		const keyBytes = hexToBytes(keyHex);
		const key = await crypto.subtle.importKey(
			"raw",
			keyBytes,
			{ name: "AES-CTR" },
			false,
			["decrypt"],
		);
		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-CTR", counter: new Uint8Array(16), length: 128 },
			key,
			data,
		);
		return new Uint8Array(decrypted);
	}

	// Cover
	function normalizeCoverUrl(url) {
		if (!url) return null;
		return url
			.replace(/%%$/, `${COVER_SIZE}x${COVER_SIZE}`)
			.replace(/\d+x\d+$/, `${COVER_SIZE}x${COVER_SIZE}`);
	}

	async function fetchAndResizeCover(coverUrl) {
		const url = normalizeCoverUrl(coverUrl);
		if (!url) return null;

		return new Promise((resolve) => {
			const img = new Image();
			img.crossOrigin = "anonymous";

			img.onload = () => {
				try {
					const canvas = document.createElement("canvas");
					canvas.width = canvas.height = COVER_SIZE;
					canvas.getContext("2d").drawImage(img, 0, 0, COVER_SIZE, COVER_SIZE);
					canvas.toBlob(
						(blob) => {
							if (!blob) {
								resolve(null);
								return;
							}
							const reader = new FileReader();
							reader.onloadend = () => {
								const bin = atob(reader.result.split(",")[1]);
								const data = new Uint8Array(bin.length);
								for (let i = 0; i < bin.length; i++)
									data[i] = bin.charCodeAt(i);
								resolve({ data, mime: "image/jpeg" });
							};
							reader.onerror = () => resolve(null);
							reader.readAsDataURL(blob);
						},
						"image/jpeg",
						0.92,
					);
				} catch {
					resolve(null);
				}
			};

			img.onerror = () => resolve(null);
			img.src = url;
		});
	}

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

		const artist = sanitize(track.artistNames?.[0] ?? "Unknown");
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

	// Button Injection
	function removeDownloadButton() {
		document.getElementById(DL_BTN_ID)?.remove();
		lastTrackId = null;
	}

	function injectDownloadButton() {
		if (document.getElementById("nm-download-btn")) return;

		const settingsBtn = document.querySelector(
			'[class*="PlayerBarDesktopWithBackgroundProgressBar_settingsButton"]',
		);
		if (!settingsBtn) {
			removeDownloadButton();
			return;
		}

		const container = settingsBtn.parentElement;
		if (!container) return;

		const track = window.nextmusicApi?.getCurrentTrack?.();
		const trackId = track?.id ?? null;

		if (lastTrackId === trackId && document.getElementById(DL_BTN_ID)) return;
		removeDownloadButton();
		lastTrackId = trackId;

		const btn = document.createElement("button");
		btn.id = DL_BTN_ID;
		btn.innerHTML = DL_ICON_SVG;

		btn.addEventListener("click", async () => {
			const currentTrack = window.nextmusicApi?.getCurrentTrack?.();
			if (!currentTrack) {
				showError("Play a track first");
				return;
			}

			btn.disabled = true;
			btn.innerHTML =
				DL_SPINNER_SVG +
				'<div id="nm-dl-progress-track"></div>' +
				'<div id="nm-dl-progress-fill"></div>';
			const fill = btn.querySelector("#nm-dl-progress-fill");

			try {
				await downloadTrack(currentTrack, (phase, ratio) => {
					if (phase === "convert" && ratio === 0) {
						fill.style.transition = "none";
						fill.style.width = "0%";
						fill.getBoundingClientRect();
						fill.style.transition = "width 0.12s ease";
					}
					fill.style.width = `${Math.min(ratio * 100, 100)}%`;
				});
				fill.style.width = "100%";
				await new Promise((r) => setTimeout(r, 180));
			} catch (err) {
				showError(`Error: ${err.message}`);
			} finally {
				btn.disabled = false;
				btn.innerHTML = DL_ICON_SVG;
			}
		});

		container.insertBefore(btn, settingsBtn);
	}

	const nmDownloaderObserver = new MutationObserver(() =>
		injectDownloadButton(),
	);
	nmDownloaderObserver.observe(document.body, {
		childList: true,
		subtree: true,
	});
})();
