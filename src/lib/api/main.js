window.nextmusicApi = {
	ContainerId,

	getSettings(name) {
		const port = window.__nextmusicApiAssetPort ?? 2007;
		const listeners = [];
		let lastJson = null;
		let pollingTimer = null;

		function parseHandle(data) {
			const result = {};
			for (const section of data.sections ?? []) {
				for (const item of section.items ?? []) {
					if (!item.id) continue;
					let value, def;
					if (item.type === "button") {
						def = item.defaultParameter ?? false;
						value = item.bool ?? def;
					} else if (
						item.type === "text" &&
						Array.isArray(item.buttons) &&
						item.buttons[0]
					) {
						def = item.buttons[0].defaultParameter ?? "";
						value = item.buttons[0].text ?? def;
					} else {
						def = item.defaultParameter ?? null;
						value = def;
					}
					result[item.id] = { value, default: def };
				}
			}
			return result;
		}

		async function fetchSettings() {
			try {
				const res = await fetch(
					`http://127.0.0.1:${port}/get_handle?name=${encodeURIComponent(name)}`,
				);
				if (!res.ok) return null;
				const json = await res.json();
				return json.data ? parseHandle(json.data) : null;
			} catch {
				return null;
			}
		}

		let pollDelay = 1000;
		const MAX_POLL_DELAY = 30_000;

		function notify(settings) {
			for (const cb of listeners) {
				try {
					cb(settings);
				} catch {}
			}
		}

		function scheduleNextPoll() {
			pollingTimer = setTimeout(async () => {
				pollingTimer = null;
				const settings = await fetchSettings();
				if (settings) {
					pollDelay = 1000;
					const cur = JSON.stringify(settings);
					if (cur !== lastJson) {
						lastJson = cur;
						notify(settings);
					}
				} else {
					pollDelay = Math.min(pollDelay * 2, MAX_POLL_DELAY);
				}
				scheduleNextPoll();
			}, pollDelay);
		}

		function startPolling() {
			if (pollingTimer) return;
			scheduleNextPoll();
		}

		return {
			onChange(callback) {
				listeners.push(callback);
				startPolling();
				fetchSettings().then((settings) => {
					if (!settings) return;
					lastJson = JSON.stringify(settings);
					try {
						callback(settings);
					} catch {}
				});
			},
		};
	},

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

	getCurrentTrackCodec() {
		const meta = getCurrentMeta();
		return meta ? (_codecMap.get(String(meta.id)) ?? "mp3") : "mp3";
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
	getCurrentAverageColor,

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
