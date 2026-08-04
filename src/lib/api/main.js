window.nextmusicApi = {
	ContainerId,

	getSettings(name) {
		const port = window.__nextmusicApiAssetPort ?? 2007;
		const listeners = new Set();
		let currentSettings = {};
		let lastJson = null;
		let pollingTimer = null;

		function pick(value, fallback) {
			return value === undefined || value === null ? fallback : value;
		}

		function parseItem(item) {
			switch (item.type) {
				case "button": {
					const def = item.defaultParameter ?? false;
					return { value: pick(item.bool, def), default: def };
				}
				case "selector": {
					const def = item.defaultParameter ?? null;
					return { value: pick(item.selected, def), default: def };
				}
				case "slider": {
					const def = item.defaultParameter ?? null;
					return { value: pick(item.value, def), default: def };
				}
				case "color": {
					const def = item.defaultParameter ?? "";
					return { value: pick(item.input, def), default: def };
				}
				case "text": {
					const button = Array.isArray(item.buttons)
						? item.buttons[0]
						: null;
					const def = pick(
						button?.defaultParameter ?? item.defaultParameter,
						"",
					);
					return { value: pick(button?.text, def), default: def };
				}
				default: {
					const def = item.defaultParameter ?? null;
					return {
						value: pick(item.value ?? item.input, def),
						default: def,
					};
				}
			}
		}

		function parseHandle(data) {
			const result = {};
			for (const section of data.sections ?? []) {
				for (const item of section.items ?? []) {
					if (!item.id) continue;
					result[item.id] = parseItem(item);
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

		function clone(value) {
			try {
				return structuredClone(value);
			} catch {
				return JSON.parse(JSON.stringify(value));
			}
		}

		function notify() {
			for (const cb of listeners) {
				try {
					cb(clone(currentSettings));
				} catch {}
			}
		}

		function apply(settings) {
			const json = JSON.stringify(settings);
			if (json === lastJson) return false;
			lastJson = json;
			currentSettings = settings;
			return true;
		}

		function scheduleNextPoll() {
			pollingTimer = setTimeout(async () => {
				pollingTimer = null;
				const settings = await fetchSettings();
				if (settings) {
					pollDelay = 1000;
					if (apply(settings)) notify();
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

		startPolling();
		fetchSettings().then((settings) => {
			if (settings && apply(settings)) notify();
		});

		return {
			getCurrent() {
				return clone(currentSettings);
			},
			onChange(callback) {
				if (typeof callback !== "function") return () => {};
				listeners.add(callback);
				startPolling();

				if (lastJson !== null) {
					try {
						callback(clone(currentSettings));
					} catch {}
				}

				return () => listeners.delete(callback);
			},
		};
	},

	getSiteComponents(options) {
		const found = getSiteComponents(options);
		return {
			components: found,
			missing: getMissingSiteComponents(),
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
			throw new Error(
				`[downloadAsset] Server error ${res.status}: ${text}`,
			);
		}
		return res.json();
	},

	nextText(text) {
		if (window.__nmcTitleBarConfig?.showYandexMusicVersion) {
			console.warn(
				"nextText ignored: Yandex Music version mode is enabled",
			);
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

	getPlayers,
	getActivePlayerId: () => getActivePlayer()?.id ?? null,
	pauseAll,

	// Same transport surface as the top-level methods, but aimed at one
	// specific playback instead of whichever one is active.
	player: (id) => {
		const get = () => getPlayerById(id);
		return {
			id,
			exists: () => !!get(),
			getState: () => {
				const p = get();
				const ps = p?.playbackState?.playerState;
				if (!ps) return null;
				return {
					playerId: p.id,
					status: ps.status?.value,
					progress: ps.progress?.value,
					volume: ps.volume?.value,
				};
			},
			setProgress: (progress) => get()?.setProgress(progress),
			setVolume: (volume) => get()?.setVolume(volume),
			setSpeed: (speed) => get()?.setSpeed(speed),
			play: () => get()?.play(),
			pause: () => get()?.pause(),
			resume: () => get()?.resume(),
			togglePause: () => get()?.togglePause(),
			next: () => get()?.moveForward(),
			prev: () => get()?.moveBackward(),
		};
	},

	onStatusChange: (listener) =>
		observeActivePlayer(
			(p) => p.playbackState?.playerState?.status,
			listener,
		),
	onProgressChange: (listener) =>
		observeActivePlayer(
			(p) => p.playbackState?.playerState?.progress,
			listener,
		),
	// Fires on every track change, on every page, with no player bar involved.
	// currentEntity also fires when the entity is merely mutated (metadata
	// arriving, queue reshuffles), so repeats of the same track are dropped.
	onTrackChange: (listener) => {
		let lastId;
		return observeActivePlayer(
			(p) => p.playbackState?.queueState?.currentEntity,
			() => {
				const track = getCurrentTrack();
				const id = track?.id ?? null;
				if (id === lastId) return;
				lastId = id;
				listener(track);
			},
		);
	},
	onActivePlayerChange: (listener) =>
		getPlaybackController()?.activePlayback?.onChange?.((p) =>
			listener(p?.id ?? null),
		) ?? (() => {}),

	setSpeed: (speed) => getActivePlayer()?.setSpeed(speed),
	setProgress: (progress) => getActivePlayer()?.setProgress(progress),
	setVolume: (volume) => getActivePlayer()?.setVolume(volume),
	play: () => getActivePlayer()?.play(),
	pause: () => getActivePlayer()?.pause(),
	resume: () => getActivePlayer()?.resume(),
	togglePause: () => getActivePlayer()?.togglePause(),
	next: () => getActivePlayer()?.moveForward(),
	prev: () => getActivePlayer()?.moveBackward(),
};

(() => {
	if (window.__nmcStoreNavStarted) return;
	window.__nmcStoreNavStarted = true;

	const open = () => openNextStore();

	if (window.nmcStore?.openOnBoot) {
		let openAttempts = 0;
		const tryOpen = () => {
			if (open()) return;
			if (openAttempts++ > 100) return;
			setTimeout(tryOpen, 100);
		};
		tryOpen();
	}

	let attempts = 0;
	const tryMount = () => {
		let mounted = false;
		try {
			mounted = mountNextStoreNavItem("Next Store", open);
		} catch {}

		if (mounted) return;

		if (attempts++ > 100) return;
		setTimeout(tryMount, 300);
	};

	tryMount();
})();
