(function () {
	const DL_BTN_ID = "nm-download-btn";
	const COVER_SIZE = 1000;
	window.nextmusicApi;

	// Standard salt for Yandex Music web version (publicly known)
	const YM_SALT = "XGRlBW9FXlekgbPrRHuSiA";

	const DL_ICON_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"
  aria-hidden="true" focusable="false" role="img" class="svg-icon">
  <use xlink:href="/icons/sprite.svg#download_xxs"/>
</svg>`;

	const DL_BTN_STYLE = `
#nm-download-btn {
  color: var(--ym-controls-color-secondary-text-enabled);
  background: transparent;
  border: 0 solid;
  z-index: 1;
}
#nm-download-btn:hover {
  color: var(--ym-controls-color-secondary-on_default-hovered);
  cursor: pointer;
}
#nm-download-btn:disabled {
  opacity: 0.4;
  cursor: default;
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

	// MD5

	function md5(str) {
		function RL(v, s) {
			return (v << s) | (v >>> (32 - s));
		}
		function AU(x, y) {
			const x8 = x & 0x80000000,
				y8 = y & 0x80000000;
			const x4 = x & 0x40000000,
				y4 = y & 0x40000000;
			const r = (x & 0x3fffffff) + (y & 0x3fffffff);
			if (x4 & y4) return r ^ 0x80000000 ^ x8 ^ y8;
			if (x4 | y4)
				return r & 0x40000000
					? r ^ 0xc0000000 ^ x8 ^ y8
					: r ^ 0x40000000 ^ x8 ^ y8;
			return r ^ x8 ^ y8;
		}
		const F = (x, y, z) => (x & y) | (~x & z);
		const G = (x, y, z) => (x & z) | (y & ~z);
		const H = (x, y, z) => x ^ y ^ z;
		const I = (x, y, z) => y ^ (x | ~z);
		const FF = (a, b, c, d, x, s, ac) =>
			AU(RL(AU(AU(AU(a, F(b, c, d)), x), ac), s), b);
		const GG = (a, b, c, d, x, s, ac) =>
			AU(RL(AU(AU(AU(a, G(b, c, d)), x), ac), s), b);
		const HH = (a, b, c, d, x, s, ac) =>
			AU(RL(AU(AU(AU(a, H(b, c, d)), x), ac), s), b);
		const II = (a, b, c, d, x, s, ac) =>
			AU(RL(AU(AU(AU(a, I(b, c, d)), x), ac), s), b);

		function toWords(s) {
			const len = s.length;
			const nw = ((len + 8 - ((len + 8) % 64)) / 64 + 1) * 16;
			const wa = new Array(nw - 1).fill(0);
			for (let i = 0; i < len; i++)
				wa[(i - (i % 4)) / 4] |= s.charCodeAt(i) << ((i % 4) * 8);
			wa[(len - (len % 4)) / 4] |= 0x80 << ((len % 4) * 8);
			wa[nw - 2] = len << 3;
			wa[nw - 1] = len >>> 29;
			return wa;
		}
		function hex(v) {
			let h = "";
			for (let i = 0; i < 4; i++) {
				const b = (v >>> (i * 8)) & 255;
				h += ("0" + b.toString(16)).slice(-2);
			}
			return h;
		}

		const x = toWords(str);
		let a = 0x67452301,
			b = 0xefcdab89,
			c = 0x98badcfe,
			d = 0x10325476;

		for (let k = 0; k < x.length; k += 16) {
			const [A, B, C, D] = [a, b, c, d];
			a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478);
			d = FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
			c = FF(c, d, a, b, x[k + 2], 17, 0x242070db);
			b = FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
			a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf);
			d = FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
			c = FF(c, d, a, b, x[k + 6], 17, 0xa8304613);
			b = FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
			a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8);
			d = FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
			c = FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1);
			b = FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
			a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122);
			d = FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
			c = FF(c, d, a, b, x[k + 14], 17, 0xa679438e);
			b = FF(b, c, d, a, x[k + 15], 22, 0x49b40821);

			a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562);
			d = GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
			c = GG(c, d, a, b, x[k + 11], 14, 0x265e5a51);
			b = GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
			a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d);
			d = GG(d, a, b, c, x[k + 10], 9, 0x02441453);
			c = GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681);
			b = GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
			a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6);
			d = GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
			c = GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87);
			b = GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
			a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905);
			d = GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
			c = GG(c, d, a, b, x[k + 7], 14, 0x676f02d9);
			b = GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);

			a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942);
			d = HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
			c = HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122);
			b = HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
			a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44);
			d = HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
			c = HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60);
			b = HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
			a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6);
			d = HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
			c = HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085);
			b = HH(b, c, d, a, x[k + 6], 23, 0x04881d05);
			a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039);
			d = HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
			c = HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8);
			b = HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);

			a = II(a, b, c, d, x[k + 0], 6, 0xf4292244);
			d = II(d, a, b, c, x[k + 7], 10, 0x432aff97);
			c = II(c, d, a, b, x[k + 14], 15, 0xab9423a7);
			b = II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
			a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3);
			d = II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
			c = II(c, d, a, b, x[k + 10], 15, 0xffeff47d);
			b = II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
			a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f);
			d = II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
			c = II(c, d, a, b, x[k + 6], 15, 0xa3014314);
			b = II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
			a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82);
			d = II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
			c = II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb);
			b = II(b, c, d, a, x[k + 9], 21, 0xeb86d391);

			a = AU(a, A);
			b = AU(b, B);
			c = AU(c, C);
			d = AU(d, D);
		}
		return (hex(a) + hex(b) + hex(c) + hex(d)).toLowerCase();
	}

	// Getting direct MP3 link via API

	async function getDirectMp3Url(trackId) {
		const ts = Math.floor(Date.now() / 1000);
		const path = `/handlers/track/${trackId}/web-album_track-track-track-main/download/m?ts=${ts}`;
		const sign = md5(YM_SALT + path);
		const apiUrl = `https://music.yandex.ru/api/v2.1${path}&sign=${sign}&external-domain=music.yandex.ru&overembed=no&__t=${ts}`;

		const r1 = await fetch(apiUrl, {
			headers: {
				"X-Retpath-Y": "https://music.yandex.ru/",
				"X-Yandex-Music-Client": "YandexMusic/4820",
			},
		});
		if (!r1.ok) throw new Error(`API step 1: HTTP ${r1.status}`);
		const d1 = await r1.json();
		if (!d1.src) throw new Error("API did not return src");

		const r2 = await fetch(d1.src + "&format=json");
		if (!r2.ok) throw new Error(`API step 2: HTTP ${r2.status}`);
		const d2 = await r2.json();

		const hash = md5(YM_SALT + d2.path.substring(1) + d2.s);
		const finalUrl = `https://${d2.host}/get-mp3/${hash}/${d2.ts}${d2.path}`;
		return finalUrl;
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

	async function buildId3Tag(track) {
		const frames = [];

		if (track.title) frames.push(_textFrame("TIT2", track.title));
		if (track.artistNames?.[0])
			frames.push(_textFrame("TPE1", track.artistNames[0]));
		if (track.albumTitle) frames.push(_textFrame("TALB", track.albumTitle));
		if (track.year) frames.push(_textFrame("TYER", String(track.year)));

		const cover = await fetchAndResizeCover(track.coverUrl);
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

	// Downloading

	async function downloadTrack(track) {
		// 1. Get direct MP3 link via API
		const mp3Url = await getDirectMp3Url(track.id);

		// 2. In parallel: download MP3 + generate ID3
		const [audioRes, id3Tag] = await Promise.all([
			fetch(mp3Url),
			buildId3Tag(track),
		]);
		if (!audioRes.ok)
			throw new Error(`Audio download error: HTTP ${audioRes.status}`);
		const audioBuf = new Uint8Array(await audioRes.arrayBuffer());

		// 3. Strip existing ID3 tag if present
		let audioStart = 0;
		if (audioBuf[0] === 0x49 && audioBuf[1] === 0x44 && audioBuf[2] === 0x33) {
			const existingSize =
				((audioBuf[6] & 0x7f) << 21) |
				((audioBuf[7] & 0x7f) << 14) |
				((audioBuf[8] & 0x7f) << 7) |
				(audioBuf[9] & 0x7f);
			audioStart = 10 + existingSize;
		}

		// 4. Assemble final buffer: new ID3 + audio
		const output = new Uint8Array(id3Tag.length + audioBuf.length - audioStart);
		output.set(id3Tag, 0);
		output.set(audioBuf.subarray(audioStart), id3Tag.length);

		// 5. Save file
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
			try {
				await downloadTrack(currentTrack);
			} catch (err) {
				showError(`Error: ${err.message}`);
			} finally {
				btn.disabled = false;
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
