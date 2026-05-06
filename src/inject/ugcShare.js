(function () {
	const LINK_BTN_ID = "ugc-share-btn";
	const LINK_ICON_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img" class="svg-icon"><use xlink:href="/icons/sprite.svg#chain_xxs"/></svg>`;
	const LINK_BTN_STYLE = `
#ugc-share-btn {
	color: var(--ym-controls-color-secondary-text-enabled);
	background: transparent;
	border: 0 solid;
	z-index: 1;
}
#ugc-share-btn:hover {
	color: var(--ym-controls-color-secondary-on_default-hovered);
	cursor: pointer;
}
`;

	const ENCRYPTION_KEY = __ENCRYPTION_KEY__;

	function getNMAPI() {
		return window.nextmusicApi;
	}

	(function injectStyles() {
		const style = document.createElement("style");
		style.textContent = LINK_BTN_STYLE;
		document.head.appendChild(style);
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
		return `https://nm.diram1x.ru/track?key=${key}`;
	}

	async function shortenUrl(url) {
		const res = await fetch(
			`https://clck.ru/--?url=${encodeURIComponent(url)}`,
		);
		if (!res.ok) throw new Error(`clck.ru error: ${res.status}`);
		return res.text();
	}

	function removeLinkButton() {
		document.getElementById(LINK_BTN_ID)?.remove();
		lastTrackId = null;
	}

	let lastTrackId = null;

	function injectLinkButton() {
		const track = getNMAPI()?.getCurrentTrack?.();

		if (!track) {
			return;
		}

		if (!track.id?.includes("-")) {
			removeLinkButton();
			return;
		}

		const container = document.querySelector(
			'[class*="PlayerBarDesktopWithBackgroundProgressBar_meta"]',
		);
		if (!container) {
			// Let's log what containers we can find
			const allContainers = document.querySelectorAll('[class*="PlayerBar"]');

			return;
		}

		if (lastTrackId === track.id && document.getElementById(LINK_BTN_ID))
			return;

		removeLinkButton();
		lastTrackId = track.id;

		const btn = document.createElement("button");
		btn.id = LINK_BTN_ID;
		btn.innerHTML = LINK_ICON_SVG;
		btn.addEventListener("click", async () => {
			const currentTrack = getNMAPI()?.getCurrentTrack?.();
			if (!currentTrack) return;

			const url = buildNmUrl(currentTrack);
			if (!url) {
				getNMAPI().showErrorToast(
					"Error: play the track first",
					getNMAPI().ContainerId.ERROR,
				);
				return;
			}

			try {
				const shortUrl = await shortenUrl(url);
				await navigator.clipboard.writeText(shortUrl);
			} catch {
				await navigator.clipboard.writeText(url);
			}

			getNMAPI().showCopyToast(currentTrack.title, "track");
		});

		container.insertBefore(btn, container.firstChild);
	}

	const observer = new MutationObserver(() => {
		injectLinkButton();
	});
	observer.observe(document.body, { childList: true, subtree: true });
})();
