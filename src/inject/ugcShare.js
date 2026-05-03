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

	const NM_API = window.nextmusicApi;

	(function injectStyles() {
		const style = document.createElement("style");
		style.textContent = LINK_BTN_STYLE;
		document.head.appendChild(style);
	})();

	let lastTrackId = null;

	function buildNmUrl(track) {
		const mp3Url = NM_API?.getCurrentMp3Url?.();
		if (!mp3Url) return null;

		const params = new URLSearchParams({
			url: mp3Url,
			cover: track.coverUrl ?? "",
			artist: track.artistNames?.[0] ?? "Unknown",
			title: track.title ?? "Unknown",
		});
		return `https://nm.diram1x.ru/track?${params.toString()}`;
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

	function injectLinkButton() {
		const track = NM_API?.getCurrentTrack?.();
		if (!track?.id?.includes("-")) {
			removeLinkButton();
			return;
		}

		const container = document.querySelector(
			'[class*="PlayerBarDesktopWithBackgroundProgressBar_meta"]',
		);
		if (!container) return;

		if (lastTrackId === track.id && document.getElementById(LINK_BTN_ID))
			return;

		removeLinkButton();
		lastTrackId = track.id;

		const btn = document.createElement("button");
		btn.id = LINK_BTN_ID;
		btn.innerHTML = LINK_ICON_SVG;
		btn.addEventListener("click", async () => {
			const currentTrack = NM_API?.getCurrentTrack?.();
			if (!currentTrack) return;

			const url = buildNmUrl(currentTrack);
			if (!url) {
				NM_API.showErrorToast(
					"Error: play the track first",
					NM_API.ContainerId.ERROR,
				);
				return;
			}

			try {
				const shortUrl = await shortenUrl(url);
				await navigator.clipboard.writeText(shortUrl);
			} catch {
				await navigator.clipboard.writeText(url);
			}

			NM_API.showCopyToast(currentTrack.title, "track");
		});

		container.insertBefore(btn, container.firstChild);
	}

	const observer = new MutationObserver(() => injectLinkButton());
	observer.observe(document.body, { childList: true, subtree: true });
})();
