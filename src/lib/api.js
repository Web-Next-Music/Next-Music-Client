{
	const webpackGlobal = window.webpackChunk_N_E;
	let appRequire = null;

	webpackGlobal.push([
		[Symbol()],
		{},
		(r) => {
			appRequire = r;
		},
	]);
	webpackGlobal.pop();

	function findModuleExport(req, exportKey) {
		const mods = req.m ?? {};
		for (const id of Object.keys(mods)) {
			try {
				const m = req(id);
				if (m && typeof m[exportKey] === "function") {
					return m[exportKey];
				}
			} catch {}
		}
		return null;
	}

	// Toast

	const ContainerId = {
		INFO: "INFO",
		ERROR: "ERROR",
		IMPORTANT: "IMPORTANT",
		FULLSCREEN_INFO: "FULLSCREEN_INFO",
		FULLSCREEN_ERROR: "FULLSCREEN_ERROR",
		AD_INFO: "AD_INFO",
	};

	const defaultToastOptions = {
		[ContainerId.INFO]: {
			autoClose: 2000,
			closeOnClick: false,
			pauseOnHover: true,
			draggable: false,
			single: true,
		},
		[ContainerId.ERROR]: {
			autoClose: 2000,
			closeOnClick: false,
			pauseOnHover: true,
			draggable: false,
			single: false,
		},
		[ContainerId.FULLSCREEN_INFO]: {
			autoClose: 2000,
			closeOnClick: false,
			pauseOnHover: true,
			draggable: false,
			single: true,
		},
		[ContainerId.FULLSCREEN_ERROR]: {
			autoClose: 2000,
			closeOnClick: false,
			pauseOnHover: true,
			draggable: false,
			single: true,
		},
		[ContainerId.IMPORTANT]: {
			closeOnClick: false,
			draggable: false,
			single: false,
			important: true,
		},
		[ContainerId.AD_INFO]: {
			autoClose: 2000,
			closeOnClick: false,
			pauseOnHover: true,
			draggable: false,
			single: true,
		},
	};

	function findMods(require) {
		const mods = require.m ?? {};
		let notificationMod = null;
		let reactMod = null;
		let componentsMod = null;
		let notificationCopyMod = null;

		for (const id of Object.keys(mods)) {
			try {
				const m = require(id);
				if (!m) continue;
				const keys = Object.keys(m);

				if (
					!notificationMod &&
					keys.length === 3 &&
					typeof m.Notification === "function" &&
					typeof m.notification === "function" &&
					typeof m.dismiss === "function"
				) {
					notificationMod = m;
				}

				if (
					!reactMod &&
					typeof m.createElement === "function" &&
					typeof m.Children === "object" &&
					keys.length === 40
				) {
					reactMod = m;
				}

				if (
					!componentsMod &&
					typeof m.$W === "function" &&
					typeof m.NX === "object" &&
					keys.length === 99
				) {
					componentsMod = m;
				}

				if (!notificationCopyMod && typeof m.NotificationCopy === "function") {
					notificationCopyMod = m;
				}

				if (notificationMod && reactMod && componentsMod && notificationCopyMod)
					break;
			} catch {}
		}

		return { notificationMod, reactMod, componentsMod, notificationCopyMod };
	}

	function notify(message, containerId, extra, cover) {
		containerId = containerId || ContainerId.INFO;
		extra = extra || {};

		window.webpackChunk_N_E.push([
			[Math.random()],
			{},
			(require) => {
				const { notificationMod, reactMod, componentsMod } = findMods(require);

				if (!notificationMod || !reactMod || !componentsMod) {
					console.warn("[nextmusicApi] toast modules not found");
					return;
				}

				const resolvedMessage =
					typeof message === "function" ? message(reactMod) : message;

				const toastEl = reactMod.createElement(componentsMod.$W, {
					message: resolvedMessage,
					...(cover
						? {
								cover: reactMod.createElement("img", {
									src: cover,
									width: 40,
									height: 40,
								}),
								coverRadius: "m",
							}
						: {}),
				});

				notificationMod.notification({
					message: toastEl,
					options: {
						...defaultToastOptions[containerId],
						containerId,
						...extra,
					},
				});
			},
		]);
	}

	function notifyCopy(entityTitle, entityVariant, containerId, extra) {
		containerId = containerId || ContainerId.INFO;
		extra = extra || {};

		window.webpackChunk_N_E.push([
			[Math.random()],
			{},
			(require) => {
				const { notificationMod, reactMod, notificationCopyMod } =
					findMods(require);

				if (!notificationMod || !reactMod || !notificationCopyMod) {
					console.warn("[nextmusicApi] notifyCopy modules not found");
					return;
				}

				const toastEl = reactMod.createElement(
					notificationCopyMod.NotificationCopy,
					{
						entityVariant: entityVariant || "track",
						entityTitle,
					},
				);

				notificationMod.notification({
					message: toastEl,
					options: {
						...defaultToastOptions[containerId],
						containerId,
						...extra,
					},
				});
			},
		]);
	}

	function notifyError(errorText, containerId, extra) {
		containerId = containerId || ContainerId.ERROR;
		extra = extra || {};

		window.webpackChunk_N_E.push([
			[Math.random()],
			{},
			(require) => {
				const { notificationMod, reactMod, componentsMod } = findMods(require);

				if (!notificationMod || !reactMod || !componentsMod) {
					console.warn("[nextmusicApi] notifyError modules not found");
					return;
				}

				const toastEl = reactMod.createElement(componentsMod.hT, {
					error: errorText,
				});

				notificationMod.notification({
					message: toastEl,
					options: {
						...defaultToastOptions[containerId],
						containerId,
						...extra,
					},
				});
			},
		]);
	}

	function dismissToast(notificationId) {
		window.webpackChunk_N_E.push([
			[Math.random()],
			{},
			(require) => {
				const { notificationMod } = findMods(require);
				if (!notificationMod) {
					console.warn("[nextmusicApi] notificationMod not found for dismiss");
					return;
				}
				notificationMod.dismiss({ notificationId, forceClose: true });
			},
		]);
	}

	// FileInfo patch

	const _mp3UrlMap = new Map();
	const _mp3KeyMap = new Map(); // AES-128-CTR key hex per trackId
	const _customTrackMap = new Map(); // trackId -> { url, key, codec, bitrate, quality }
	const _customTrackMetaMap = new Map(); // trackId -> public meta used by UI/RPC

	function patchFileInfo() {
		const moduleMap = appRequire?.m;
		if (!moduleMap) return;

		for (const moduleId of Object.keys(moduleMap)) {
			try {
				const mod = appRequire(moduleId);
				const proto = mod?.v?.prototype;
				if (!proto?.getFileInfo || !proto?.getFileInfoBatch) continue;

				const origGetFileInfo = proto.getFileInfo;
				const origGetFileInfoBatch = proto.getFileInfoBatch;

				proto.getFileInfo = async function (...args) {
					const arg = args[0];
					const trackId = arg?.trackId ?? arg?.id ?? String(arg);

					if (_customTrackMap.has(String(trackId))) {
						const custom = _customTrackMap.get(String(trackId));
						// Return downloadInfo for custom track instead of calling API
						return {
							trackId: String(trackId),
							downloadInfo: {
								trackId: String(trackId),
								url: custom.url,
								urls: [custom.url],
								key: custom.key ?? "",
								codec: custom.codec ?? "mp3",
								bitrate: custom.bitrate ?? 320,
								gain: false,
								preview: false,
								transport: "raw",
							},
						};
					}

					const result = await origGetFileInfo.call(this, ...args);
					const di = result?.downloadInfo;
					const id = di?.trackId || result?.trackId;
					if (di?.url && id) {
						_mp3UrlMap.set(String(id), di.url);
						// Capture AES key while it's still present (before FckCensor clears it)
						_mp3KeyMap.set(String(id), di.key ?? "");
					}
					return result;
				};

				proto.getFileInfoBatch = async function (...args) {
					const result = await origGetFileInfoBatch.call(this, ...args);
					for (const info of result?.downloadInfos ?? []) {
						if (info?.url && info?.trackId) {
							_mp3UrlMap.set(String(info.trackId), info.url);
							_mp3KeyMap.set(String(info.trackId), info.key ?? "");
						}
					}
					return result;
				};

				break;
			} catch {}
		}
	}

	patchFileInfo();

	// Custom track mediaSourceData watcher

	function watchEntityForCustomTrack(entity, trackId) {
		const custom = _customTrackMap.get(String(trackId));
		if (!custom) return;

		function buildMediaSource() {
			return {
				type: "downloadInfoSource",
				vsid: "",
				sourceIndex: 0,
				loadingTime: 0,
				data: {
					trackId: String(trackId),
					realId: String(trackId),
					url: custom.url,
					urls: [custom.url],
					key: custom.key ?? "",
					codec: custom.codec ?? "mp3",
					quality: custom.quality ?? "high",
					bitrate: custom.bitrate ?? 320,
					transport: "raw", // "raw" for unencrypted URLs
					gain: false,
					size: 0,
				},
			};
		}

		entity.mediaSourceData = buildMediaSource();

		let _msd = entity.mediaSourceData;
		let guarded = false;

		Object.defineProperty(entity, "mediaSourceData", {
			get() {
				return _msd;
			},
			set(v) {
				if (!guarded) {
					guarded = true;
					_msd = v;
					setTimeout(() => {
						_msd = buildMediaSource();
					}, 0);
				} else {
					_msd = buildMediaSource();
				}
			},
			configurable: true,
		});
	}

	// Player

	const VE = findModuleExport(appRequire, "VE");
	const found = [];

	function searchFiber(fiber, cls, depth = 0) {
		if (!fiber || depth > 50) return;
		if (fiber.stateNode instanceof cls) found.push(fiber.stateNode);
		let state = fiber.memoizedState;

		while (state) {
			if (state.memoizedState instanceof cls) found.push(state.memoizedState);
			state = state.next;
		}

		function searchObj(obj, visited = new Set()) {
			if (!obj || typeof obj !== "object" || visited.has(obj)) return;
			visited.add(obj);
			if (obj instanceof cls) {
				found.push(obj);
				return;
			}
			for (const v of Object.values(obj)) searchObj(v, visited);
		}

		searchObj(fiber.memoizedProps);
		searchFiber(fiber.child, cls, depth + 1);
		searchFiber(fiber.sibling, cls, depth + 1);
	}

	const rootEl = document.getElementById("__next") || document.body;
	const fiberKey = Object.keys(rootEl).find((k) =>
		k.startsWith("__reactFiber"),
	);
	searchFiber(rootEl[fiberKey], VE);
	window._ymPlayers = [...new Map(found.map((p) => [p.id, p])).values()];

	function getMainPlayer() {
		const cached = window._ymPlayers?.find((p) => p.id === "MAIN");
		if (cached) return cached;

		const wg = window.webpackChunk_N_E;
		let req = null;
		wg.push([
			[Symbol()],
			{},
			(r) => {
				req = r;
			},
		]);
		wg.pop();

		const cls = findModuleExport(req, "VE");
		const players = [];

		function sf(fiber, depth = 0) {
			if (!fiber || depth > 50) return;
			if (fiber.stateNode instanceof cls) players.push(fiber.stateNode);
			let state = fiber.memoizedState;
			while (state) {
				if (state.memoizedState instanceof cls)
					players.push(state.memoizedState);
				state = state.next;
			}
			function so(obj, visited = new Set()) {
				if (!obj || typeof obj !== "object" || visited.has(obj)) return;
				visited.add(obj);
				if (obj instanceof cls) {
					players.push(obj);
					return;
				}
				for (const v of Object.values(obj)) so(v, visited);
			}
			so(fiber.memoizedProps);
			sf(fiber.child, depth + 1);
			sf(fiber.sibling, depth + 1);
		}

		const root = document.getElementById("__next") || document.body;
		const fk = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
		sf(root[fk]);

		window._ymPlayers = [...new Map(players.map((p) => [p.id, p])).values()];
		return window._ymPlayers.find((p) => p.id === "MAIN");
	}

	function getCurrentMeta() {
		const player = getMainPlayer();
		if (!player) return null;
		const queue = player.queueController;
		const entityList = queue?.playerQueue?.queueState?.entityList?.value;
		const idx = player.playbackState?.queueState?.index?.value;
		if (idx == null || !entityList) return null;
		const meta = entityList[idx]?.entity?.entityData?.meta ?? null;
		if (!meta) return null;
		const customMeta = _customTrackMetaMap.get(String(meta.id));
		if (!customMeta) return meta;

		return {
			...customMeta,
			...meta,
			durationMs: meta.durationMs || customMeta.durationMs || 0,
			artists:
				Array.isArray(meta.artists) && meta.artists.length > 0
					? meta.artists
					: customMeta.artists ?? [],
			albums:
				Array.isArray(meta.albums) && meta.albums.length > 0
					? meta.albums
					: customMeta.albums ?? [],
			coverUri: meta.coverUri || customMeta.coverUri || "",
		};
	}

	function updateCustomTrackDuration(trackId, durationMs) {
		const normalizedDurationMs = Math.max(0, Math.round(Number(durationMs) || 0));
		if (!normalizedDurationMs) return;

		const customMeta = _customTrackMetaMap.get(String(trackId));
		if (customMeta) {
			customMeta.durationMs = normalizedDurationMs;
		}

		const player = getMainPlayer();
		const entityList =
			player?.queueController?.playerQueue?.queueState?.entityList?.value;

		for (const item of entityList ?? []) {
			const meta = item?.entity?.entityData?.meta;
			if (String(meta?.id) === String(trackId)) {
				meta.durationMs = normalizedDurationMs;
			}
		}
	}

	function resolveCustomTrackDuration(trackId, url, fallbackDurationMs = 0) {
		const normalizedFallback = Math.max(
			0,
			Math.round(Number(fallbackDurationMs) || 0),
		);

		if (normalizedFallback > 0) {
			updateCustomTrackDuration(trackId, normalizedFallback);
			return;
		}

		if (!url) return;

		const audio = new Audio();
		audio.preload = "metadata";

		const cleanup = () => {
			audio.removeEventListener("loadedmetadata", onLoadedMetadata);
			audio.removeEventListener("durationchange", onLoadedMetadata);
			audio.removeEventListener("error", onError);
			audio.src = "";
		};

		const onLoadedMetadata = () => {
			if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
			updateCustomTrackDuration(trackId, audio.duration * 1000);
			cleanup();
		};

		const onError = () => {
			console.warn(
				"[nextmusicApi] Failed to resolve custom track duration:",
				trackId,
			);
			cleanup();
		};

		audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
		audio.addEventListener("durationchange", onLoadedMetadata);
		audio.addEventListener("error", onError, { once: true });
		audio.src = url;
		audio.load();
	}

	// Public API

	window.nextmusicApi = {
		showToast(message, containerId, extra, cover) {
			notify(message, containerId, extra, cover);
		},

		showCopyToast(entityTitle, entityVariant, containerId, extra) {
			notifyCopy(entityTitle, entityVariant, containerId, extra);
		},

		showErrorToast(errorText, containerId, extra) {
			notifyError(errorText, containerId, extra);
		},

		dismissToast(notificationId) {
			dismissToast(notificationId);
		},

		ContainerId,

		getCurrentYandexMusicVersion() {
			var entries = performance.getEntriesByType("resource");
			for (var i = 0; i < entries.length; i++) {
				var m = entries[i].name.match(/\/v(\d+\.\d+\.\d+)\//);
				if (m) return m[1];
			}
			return null;
		},

		getCurrentMp3Url() {
			const meta = getCurrentMeta();
			if (!meta) return null;
			return _mp3UrlMap.get(String(meta.id)) ?? null;
		},

		getCurrentTrackKey() {
			const meta = getCurrentMeta();
			if (!meta) return "";
			return _mp3KeyMap.get(String(meta.id)) ?? "";
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
				console.warn(`nextText ignored: Yandex Music version mode is enabled`);
				return;
			}
			const el = document.querySelector(".TitleBar_nextText");
			if (el) el.textContent = text;
		},

		playTrackById(trackId) {
			const player = getMainPlayer();
			const queue = player.queueController;
			const currentIndex = player.playbackState.queueState.index.value;

			queue.inject({
				entitiesData: [
					{
						type: "music",
						meta: { id: String(trackId), realId: String(trackId) },
						fromCurrentContext: false,
						loadEntityMeta: true,
					},
				],
				position: currentIndex + 1,
				silent: false,
			});

			setTimeout(() => {
				const entityList = queue.playerQueue.queueState.entityList.value;
				const idx = entityList.findIndex(
					(e) => e?.entity?.entityData?.meta?.id === String(trackId),
				);
				if (idx !== -1) {
					player.setEntityByIndex(idx);
					player.play();
				} else {
					console.warn("[nextmusicApi] Track not found in queue:", trackId);
				}
			}, 100);
		},

		/**
		 * Play a custom track with arbitrary audio URL.
		 *
		 * @param {object} trackData
		 * @param {string}   trackData.id          — unique ID (e.g., "custom_1")
		 * @param {string}   trackData.url         — direct link to audio file (mp3/aac/flac)
		 * @param {string}   [trackData.title]     — track title
		 * @param {{id, name}[]} [trackData.artists] — list of artists
		 * @param {string|number} [trackData.albumId] — album ID
		 * @param {string}   [trackData.coverUri]  — cover: "avatars.yandex.net/.../%%" or full https://
		 * @param {string}   [trackData.cover]     — alternatively: direct link to cover image
		 * @param {number}   [trackData.durationMs] — duration in milliseconds
		 * @param {string}   [trackData.key]       — AES decryption key, usually ""
		 * @param {string}   [trackData.codec]     — "mp3" by default
		 * @param {number}   [trackData.bitrate]   — 320 by default
		 * @param {string}   [trackData.quality]   — "high" by default
		 */
		playCustomTrack(trackData) {
			const id = String(trackData.id);
			const durationMs = Math.max(0, Math.round(Number(trackData.durationMs) || 0));

			// Register custom track
			_customTrackMap.set(id, {
				url: trackData.url,
				key: trackData.key ?? "",
				codec: trackData.codec ?? "mp3",
				bitrate: trackData.bitrate ?? 320,
				quality: trackData.quality ?? "high",
			});
			_mp3UrlMap.set(id, trackData.url);

			const player = getMainPlayer();
			if (!player) {
				console.warn("[nextmusicApi] playCustomTrack: player not found");
				return;
			}

			const queue = player.queueController;
			const currentIndex = player.playbackState.queueState.index.value;

			let coverUri = trackData.coverUri ?? "";
			if (trackData.cover) {
				coverUri = trackData.cover;
			}

			// Metadata in the format the player expects
			const meta = {
				id,
				realId: id,
				title: trackData.title ?? "Custom Track",
				type: "music",
				artists: trackData.artists ?? [],
				albums: trackData.albumId ? [{ id: trackData.albumId }] : [],
				coverUri,
				durationMs,
				available: true,
				availableForPremiumUsers: true,
				availableFullWithoutPermission: true,
				lyricsAvailable: false,
				lyricsInfo: {
					hasAvailableSyncLyrics: false,
					hasAvailableTextLyrics: false,
				},
				rememberPosition: false,
				fileSize: 0,
				storageDir: "",
				r128: { i: 0, tp: 0 },
				fade: { inStart: 0, inStop: 0, outStart: 0, outStop: 0 },
				previewDurationMs: 0,
				trackSource: "OWN",
			};
			_customTrackMetaMap.set(id, { ...meta });

			// Function to set mediaSourceData when entity appears in queue
			const applyMediaSourceToQueue = () => {
				const entityList = queue.playerQueue.queueState.entityList.value;
				for (let i = 0; i < entityList.length; i++) {
					const ent = entityList[i]?.entity;
					if (
						ent &&
						(ent.entityData?.meta?.id === id || ent._customTrackId === id)
					) {
						watchEntityForCustomTrack(ent, id);
						ent._customTrackId = id;
						return i;
					}
				}
				return -1;
			};

			// Inject track into queue
			queue.inject({
				entitiesData: [
					{
						type: "music",
						meta,
						fromCurrentContext: false,
						loadEntityMeta: false,
					},
				],
				position: currentIndex + 1,
				silent: false,
			});

			// Multiple attempts to set mediaSourceData
			let attempts = 0;
			const tryApplyMediaSource = () => {
				attempts++;
				const idx = applyMediaSourceToQueue();
				if (idx !== -1) {
					player.setEntityByIndex(idx);
					player.play();
				} else if (attempts < 10) {
					setTimeout(tryApplyMediaSource, 50);
				} else {
					console.warn(
						"[nextmusicApi] Failed to find and set up custom track after",
						attempts,
						"attempts",
					);
				}
			};

			tryApplyMediaSource();
			resolveCustomTrackDuration(id, trackData.url, durationMs);
		},

		setSpeed(speed) {
			getMainPlayer()?.setSpeed(speed);
		},
		setProgress(progress) {
			getMainPlayer()?.setProgress(progress);
		},
		setVolume(volume) {
			getMainPlayer()?.setVolume(volume);
		},
		play() {
			getMainPlayer()?.play();
		},
		pause() {
			getMainPlayer()?.pause();
		},
		resume() {
			getMainPlayer()?.resume();
		},
		togglePause() {
			getMainPlayer()?.togglePause();
		},
		next() {
			getMainPlayer()?.moveForward();
		},
		prev() {
			getMainPlayer()?.moveBackward();
		},

		getCurrentTrack() {
			const meta = getCurrentMeta();
			if (!meta) return null;

			let coverUrl = null;
			if (meta.coverUri) {
				if (
					meta.coverUri.startsWith("http://") ||
					meta.coverUri.startsWith("https://")
				) {
					coverUrl = meta.coverUri;
				} else {
					coverUrl = "https://" + meta.coverUri.replace("%%", "400x400");
				}
			}

			const artists = (meta.artists ?? []).map((a) => ({
				id: a.id,
				name: a.name,
			}));

			return {
				id: meta.id,
				realId: meta.realId,
				title: meta.title,
				version: meta.version ?? null,
				artists,
				artistIds: artists.map((a) => a.id),
				artistNames: artists.map((a) => a.name),
				albumId: meta.albums?.[0]?.id ?? null,
				coverUrl,
				trackUrl: `https://music.yandex.ru/track/${meta.id}`,
				durationMs: meta.durationMs ?? null,
				contentWarning: meta.contentWarning ?? null,
			};
		},

		getState() {
			const player = getMainPlayer();
			if (!player) return null;
			const ps = player.playbackState;
			return {
				status: ps?.playerState?.status?.value,
				progress: ps?.playerState?.progress?.value,
				volume: ps?.playerState?.volume?.value,
				shuffle: ps?.playerState?.shuffle?.value,
				repeat: ps?.playerState?.repeatMode?.value,
			};
		},
	};
}
