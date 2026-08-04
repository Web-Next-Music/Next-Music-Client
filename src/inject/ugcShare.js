(function () {
	const LINK_ICON_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img" class="svg-icon"><use xlink:href="/icons/sprite.svg#chain_xxs"/></svg>`;

	const ENCRYPTION_KEY = window.__NEXT_MUSIC_ENCRYPTION_KEY__ || "";

	function getNMAPI() {
		return window.nextmusicApi;
	}

	// Track key decode and paste handler

	let lastPlayedToken = null;
	let lastPlayTime = 0;
	const PLAY_COOLDOWN_MS = 500; // Prevent spam from repeated paste events

	function decodeTrackKey(encodedKey) {
		try {
			// Reverse base64url to base64
			let b64 = encodedKey.replace(/-/g, "+").replace(/_/g, "/");
			// Add padding if needed
			b64 += "=".repeat((4 - (b64.length % 4)) % 4);

			// Decode base64
			const binaryString = atob(b64);
			const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
			const out = new Uint8Array(binaryString.length);

			for (let i = 0; i < binaryString.length; i++) {
				out[i] =
					binaryString.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
			}

			// Decode to string and parse JSON
			const jsonString = new TextDecoder().decode(out);
			const data = JSON.parse(jsonString);

			return {
				url: data.u,
				title: data.t,
				artist: data.a,
				cover: data.c,
			};
		} catch (e) {
			console.warn("[ugcShare] Failed to decode track key:", e.message);
			return null;
		}
	}

	function extractTrackKeyFromText(text) {
		return text.startsWith("CVc-") ? text : null;
	}

	function handleTrackKeyPaste(e) {
		if (!e.clipboardData) return;

		const clipboardText = e.clipboardData.getData("text/plain");
		if (!clipboardText) return;

		const trackKey = extractTrackKeyFromText(clipboardText);
		if (!trackKey) return;

		// Prevent spam from repeated paste events
		const now = Date.now();
		if (
			trackKey === lastPlayedToken &&
			now - lastPlayTime < PLAY_COOLDOWN_MS
		) {
			return;
		}

		const decodedData = decodeTrackKey(trackKey);
		if (!decodedData || !decodedData.url) return;

		// Prevent default paste behavior
		e.preventDefault();
		lastPlayedToken = trackKey;
		lastPlayTime = now;

		const api = getNMAPI();
		if (!api || !api.playCustomTrack) {
			console.warn("[ugcShare] playCustomTrack not available");
			return;
		}

		console.log("[ugcShare] Playing shared track:", decodedData.title);

		// Play the custom track
		api.playCustomTrack({
			id: "shared-" + Date.now(),
			url: decodedData.url,
			title: decodedData.title || "Shared Track",
			artists: decodedData.artist
				? [{ id: 0, name: decodedData.artist }]
				: [],
			cover: decodedData.cover,
		});

		// Show notification
		if (api.showToast) {
			api.showErrorToast(
				`Now playing: ${decodedData.title || "Shared Track"}`,
				api.ContainerId.INFO,
			);
		}
	}

	// Install paste handler
	(function installPasteHandler() {
		document.addEventListener("paste", handleTrackKeyPaste, true);
	})();

	// XOR-cipher + base64url
	function encodeTrackKey(data) {
		const compact = { u: data.url };
		if (data.title) compact.t = data.title;
		if (data.artist) compact.a = data.artist;
		if (data.cover) compact.c = data.cover;

		const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
		const keyBytes = new TextEncoder().encode(ENCRYPTION_KEY);
		const out = new Uint8Array(jsonBytes.length);
		for (let i = 0; i < jsonBytes.length; i++) {
			out[i] = jsonBytes[i] ^ keyBytes[i % keyBytes.length];
		}
		return btoa(String.fromCharCode(...out))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");
	}

	function buildNmUrl(track) {
		const mp3Url = getNMAPI()?.getCurrentMp3Url?.();
		if (!mp3Url) return null;

		const key = encodeTrackKey({
			url: mp3Url,
			title: track.title ?? undefined,
			artist: track.artistNames?.[0] ?? undefined,
			cover: track.coverUrl ?? undefined,
		});
		const token = key;
		return `https://nm.diram1x.ru/track?key=${token}`;
	}

	async function shortenUrl(url) {
		const res = await fetch(
			`https://clck.ru/--?url=${encodeURIComponent(url)}`,
		);
		if (!res.ok) throw new Error(`clck.ru error: ${res.status}`);
		return res.text();
	}

	async function onShareClick() {
		const api = getNMAPI();
		const currentTrack = api?.getCurrentTrack?.();
		if (!currentTrack) return;

		const url = buildNmUrl(currentTrack);
		if (!url) {
			api.showErrorToast(
				"Error: play the track first",
				api.ContainerId.ERROR,
			);
			return;
		}

		try {
			const shortUrl = await shortenUrl(url);
			await navigator.clipboard.writeText(shortUrl);
		} catch {
			await navigator.clipboard.writeText(url);
		}

		api.showCopyToast(currentTrack.title, "track");
	}

	function syncShareButton(track) {
		const api = getNMAPI();
		if (!api?.mountUgcShareButton) return;

		if (!track?.id?.includes("-")) {
			api.unmountUgcShareButton?.();
			return;
		}

		api.mountUgcShareButton(LINK_ICON_SVG, onShareClick);
	}

	getNMAPI()?.onTrackChange?.(syncShareButton);
	syncShareButton(getNMAPI()?.getCurrentTrack?.());
})();
