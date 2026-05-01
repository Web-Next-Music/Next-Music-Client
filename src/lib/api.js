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
					const result = await origGetFileInfo.call(this, ...args);
					const url = result?.downloadInfo?.url;
					const id = result?.downloadInfo?.trackId || result?.trackId;
					if (url && id) _mp3UrlMap.set(String(id), url);
					return result;
				};

				proto.getFileInfoBatch = async function (...args) {
					const result = await origGetFileInfoBatch.call(this, ...args);
					for (const info of result?.downloadInfos ?? []) {
						if (info?.url && info?.trackId)
							_mp3UrlMap.set(String(info.trackId), info.url);
					}
					return result;
				};

				break;
			} catch {}
		}
	}

	patchFileInfo();

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
		return entityList[idx]?.entity?.entityData?.meta ?? null;
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

		getCurrentMp3Url() {
			const meta = getCurrentMeta();
			if (!meta) return null;
			return _mp3UrlMap.get(String(meta.id)) ?? null;
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

			const coverUri = meta.coverUri
				? "https://" + meta.coverUri.replace("%%", "400x400")
				: null;

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
				coverUrl: coverUri,
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
