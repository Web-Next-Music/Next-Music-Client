window.nextmusicApi = {
	ContainerId,

	showToast: notify,
	showCopyToast: notifyCopy,
	showErrorToast: notifyError,
	dismissToast,

	getCurrentYandexMusicVersion() {
		const entries = performance.getEntriesByType("resource");
		for (const entry of entries) {
			const m = entry.name.match(/\/v(\d+\.\d+\.\d+)\//);
			if (m) return m[1];
		}
		return null;
	},

	getCurrentMp3Url() {
		const meta = getCurrentMeta();
		return meta ? (_mp3UrlMap.get(String(meta.id)) ?? null) : null;
	},

	getCurrentTrackKey() {
		const meta = getCurrentMeta();
		return meta ? (_mp3KeyMap.get(String(meta.id)) ?? "") : "";
	},

	async downloadAsset(url, fileName, addonName) {
		const port = window.__nextmusicApiAssetPort ?? 2007;
		const res = await fetch(
			`http://127.0.0.1:${port}/download_asset?name=${encodeURIComponent(addonName)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url, fileName }),
			},
		);
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`[downloadAsset] Server error ${res.status}: ${text}`);
		}
		return res.json();
	},

	nextText(text) {
		if (window.__nmcTitleBarConfig?.showYandexMusicVersion) {
			console.warn("nextText ignored: Yandex Music version mode is enabled");
			return;
		}
		const el = document.querySelector(".TitleBar_nextText");
		if (el) el.textContent = text;
	},

	playTrackById,
	playCustomTrack,
	getCurrentTrack,
	getState,

	setSpeed: (speed) => getMainPlayer()?.setSpeed(speed),
	setProgress: (progress) => getMainPlayer()?.setProgress(progress),
	setVolume: (volume) => getMainPlayer()?.setVolume(volume),
	play: () => getMainPlayer()?.play(),
	pause: () => getMainPlayer()?.pause(),
	resume: () => getMainPlayer()?.resume(),
	togglePause: () => getMainPlayer()?.togglePause(),
	next: () => getMainPlayer()?.moveForward(),
	prev: () => getMainPlayer()?.moveBackward(),
};
