function isPlayerLike(obj) {
	return (
		obj !== null &&
		typeof obj === "object" &&
		typeof obj.id === "string" &&
		typeof obj.play === "function" &&
		typeof obj.moveForward === "function" &&
		obj.playbackState !== undefined &&
		obj.queueController !== undefined
	);
}

function isPlaybackControllerLike(obj) {
	return (
		obj !== null &&
		typeof obj === "object" &&
		obj.playbacks instanceof Map &&
		obj.activePlayback !== undefined &&
		typeof obj.activePlayback?.onChange === "function"
	);
}

// Yandex Music keeps several playbacks alive at once (MAIN, TRAILER, ADVERT,
// CLIP) and swaps which one is active depending on the page - the home page
// drives the same MAIN playback through a different player bar, but a video
// clip or an ad takes over a different playback entirely. The controller is the
// only place that knows which one is currently in charge.
function findPlaybackController() {
	const root = document.getElementById("__next") || document.body;
	const fiberKey = Object.keys(root).find((k) =>
		k.startsWith("__reactFiber"),
	);
	if (!fiberKey) return null;

	const visited = new Set();
	let controller = null;

	function scan(obj, depth) {
		if (
			controller ||
			!obj ||
			typeof obj !== "object" ||
			depth > 8 ||
			visited.has(obj) ||
			obj instanceof Window ||
			obj instanceof Node
		)
			return;
		visited.add(obj);
		try {
			if (isPlaybackControllerLike(obj)) {
				controller = obj;
				return;
			}
			for (const value of Object.values(obj)) scan(value, depth + 1);
		} catch {}
	}

	function walk(fiber, depth) {
		if (controller || !fiber || depth > 60) return;
		scan(fiber.memoizedProps, 0);
		let state = fiber.memoizedState;
		while (state) {
			scan(state.memoizedState, 0);
			state = state.next;
		}
		walk(fiber.child, depth + 1);
		walk(fiber.sibling, depth + 1);
	}

	walk(root[fiberKey], 0);

	window._ymPlaybackController = controller;
	return controller;
}

function getPlaybackController() {
	const cached = window._ymPlaybackController;
	if (isPlaybackControllerLike(cached) && cached.playbacks.size > 0)
		return cached;

	return findPlaybackController();
}

function refreshPlayers() {
	const controller = getPlaybackController();
	if (controller) {
		window._ymPlayers = [...controller.playbacks.values()];
		return window._ymPlayers;
	}

	const root = document.getElementById("__next") || document.body;
	const fiberKey = Object.keys(root).find((k) =>
		k.startsWith("__reactFiber"),
	);
	if (!fiberKey) return [];

	const found = [];

	function search(fiber, depth) {
		if (!fiber || depth > 50) return;
		if (isPlayerLike(fiber.stateNode)) found.push(fiber.stateNode);
		let state = fiber.memoizedState;
		while (state) {
			if (isPlayerLike(state.memoizedState))
				found.push(state.memoizedState);
			state = state.next;
		}
		function searchObj(obj, visited = new Set()) {
			if (
				!obj ||
				typeof obj !== "object" ||
				visited.has(obj) ||
				obj instanceof Window
			)
				return;
			visited.add(obj);
			try {
				if (isPlayerLike(obj)) {
					found.push(obj);
					return;
				}
				for (const v of Object.values(obj)) searchObj(v, visited);
			} catch {}
		}
		searchObj(fiber.memoizedProps);
		search(fiber.child, depth + 1);
		search(fiber.sibling, depth + 1);
	}

	search(root[fiberKey], 0);

	window._ymPlayers = [
		...new Map(found.map((player) => [player.id, player])).values(),
	];

	return window._ymPlayers;
}

function getMainPlayer() {
	const cached = window._ymPlayers?.find((p) => p.id === "MAIN");
	if (cached) return cached;

	return refreshPlayers().find((p) => p.id === "MAIN");
}

// Everything that acts on "what the user is hearing right now" should go
// through this, not through getMainPlayer(). getMainPlayer() stays for the
// music queue, which only ever lives on MAIN.
function getActivePlayer() {
	const active = getPlaybackController()?.activePlayback?.value;
	if (isPlayerLike(active)) return active;

	const players = window._ymPlayers?.length
		? window._ymPlayers
		: refreshPlayers();

	return (
		players.find(
			(p) => p.playbackState?.playerState?.status?.value === "playing",
		) ??
		players.find(
			(p) =>
				(p.playbackState?.playerState?.progress?.value?.position ?? 0) >
				0,
		) ??
		getMainPlayer()
	);
}

// getPlayback() silently falls back to MAIN for an unknown id, which would turn
// a typo into a command aimed at the wrong playback.
function getPlayerById(id) {
	const player = getPlaybackController()?.getPlayback?.(id);
	if (player?.id === id) return player;

	return refreshPlayers().find((p) => p.id === id) ?? null;
}

function getPlayers() {
	const activeId = getActivePlayer()?.id ?? null;

	return refreshPlayers().map((p) => ({
		id: p.id,
		status: p.playbackState?.playerState?.status?.value ?? null,
		progress: p.playbackState?.playerState?.progress?.value ?? null,
		active: p.id === activeId,
	}));
}

// Runs a command against every playback at once - the point being that the
// site can hand control to another playback (a clip, an ad) at any moment, and
// "stop everything" has to mean everything.
function forEachPlayer(run) {
	const results = {};

	for (const player of refreshPlayers()) {
		try {
			results[player.id] = run(player) ?? true;
		} catch (err) {
			results[player.id] = `error: ${err.message}`;
		}
	}

	return results;
}

function pauseAll() {
	return forEachPlayer((p) =>
		p.playbackState?.playerState?.status?.value === "idle"
			? "idle"
			: (p.pause(), "paused"),
	);
}

// Subscribes to one of the active player's observables and re-subscribes
// whenever the active playback is swapped, so callers get a single stable
// listener instead of having to track playback changes themselves.
const OBSERVE_RETRY_MS = 500;

function observeActivePlayer(pick, listener) {
	let unsubscribeValue = null;
	let unsubscribeActive = null;
	let activeBound = false;
	let binding = false;
	let retryTimer = null;
	let stopped = false;

	// The controller may not exist yet either, so this is attempted on every
	// bind rather than once up front.
	function bindController() {
		if (activeBound) return;

		const observable = getPlaybackController()?.activePlayback;
		if (typeof observable?.onChange !== "function") return;

		// Set before subscribing, not after: onChange fires its listener
		// synchronously, and that listener calls back into bind(). Guarding on
		// the not-yet-assigned unsubscribe handle would recurse until the
		// stack blew - taking the site's own subscription chain down with it.
		activeBound = true;
		unsubscribeActive = observable.onChange(() => bind()) ?? null;
	}

	function bind() {
		if (stopped || binding) return;
		binding = true;

		try {
			clearTimeout(retryTimer);
			retryTimer = null;

			bindController();

			unsubscribeValue?.();
			unsubscribeValue = null;

			const player = getActivePlayer();
			const observable = player ? pick(player) : null;

			// Callers subscribe as soon as the page script runs, which is long
			// before the site has mounted its player. Without this retry the
			// listener would be silently dead for the rest of the session.
			if (typeof observable?.onChange !== "function") {
				retryTimer = setTimeout(bind, OBSERVE_RETRY_MS);
				return;
			}

			unsubscribeValue = observable.onChange((value) =>
				listener(value, player),
			);
		} finally {
			binding = false;
		}
	}

	bind();

	return () => {
		stopped = true;
		clearTimeout(retryTimer);
		retryTimer = null;
		unsubscribeValue?.();
		unsubscribeActive?.();
	};
}

function pickMediaPlayer(player) {
	const store = player?.mediaController?.mediaPlayersStore?.value;
	if (!store || typeof store !== "object") return null;

	for (const candidate of Object.values(store)) {
		if (typeof candidate?.currentAudioElement?.onChange === "function") {
			return candidate;
		}
	}

	return null;
}

function getActiveAudioElement() {
	const el = pickMediaPlayer(getActivePlayer())?.currentAudioElement?.value;
	return el instanceof HTMLMediaElement ? el : null;
}

// Crossfade keeps two alternating <audio> elements alive and swaps which one
// is "current" between tracks, so the element itself - not just the player -
// has to be watched for changes. Built on observeActivePlayer, which already
// re-binds on playback swaps and retries until the site has mounted a player;
// this adds a second layer of re-binding for the element swap. If the site's
// internal shape ever changes enough that pickMediaPlayer stops finding
// anything, this simply never fires - callers must keep a fallback path.
function observeAudioElement(listener) {
	const NATIVE_EVENTS = [
		"timeupdate",
		"ratechange",
		"waiting",
		"stalled",
		"canplay",
		"playing",
		"seeking",
		"seeked",
		"pause",
	];

	let currentEl = null;

	function onNativeEvent(e) {
		if (!currentEl) return;
		listener({
			type: e.type,
			currentTime: currentEl.currentTime,
			playbackRate: currentEl.playbackRate,
			paused: currentEl.paused,
			readyState: currentEl.readyState,
		});
	}

	function detach() {
		if (!currentEl) return;
		for (const type of NATIVE_EVENTS)
			currentEl.removeEventListener(type, onNativeEvent);
		currentEl = null;
	}

	function attach(el) {
		detach();
		if (!(el instanceof HTMLMediaElement)) return;
		currentEl = el;
		for (const type of NATIVE_EVENTS)
			currentEl.addEventListener(type, onNativeEvent);
		onNativeEvent({ type: "attach" });
	}

	const unsubscribe = observeActivePlayer(
		(player) => pickMediaPlayer(player)?.currentAudioElement ?? null,
		(el) => attach(el),
	);

	return () => {
		unsubscribe();
		detach();
	};
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
				: (customMeta.artists ?? []),
		albums:
			Array.isArray(meta.albums) && meta.albums.length > 0
				? meta.albums
				: (customMeta.albums ?? []),
		coverUri: meta.coverUri || customMeta.coverUri || "",
	};
}

function applyCustomTrackToQueue(id, queue) {
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
}

// Returns false instead of throwing. queue.inject() raises
// NoCurrentContextException whenever nothing has been played yet in this
// session, and an exception here used to escape into callers mid-way through
// their own state updates, leaving them wedged.
function playTrackById(trackId) {
	const player = getMainPlayer();
	const queue = player?.queueController;

	if (!queue) {
		console.warn("[nextmusicApi] No player queue for track:", trackId);
		return false;
	}

	const currentIndex = player.playbackState?.queueState?.index?.value ?? -1;

	try {
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
	} catch (err) {
		// Most often "No current context": the queue has never been set up,
		// so there is nothing to inject into.
		console.warn(
			`[nextmusicApi] Cannot queue track ${trackId}: ${err.message}`,
		);
		return false;
	}

	setTimeout(() => {
		try {
			const entityList = queue.playerQueue.queueState.entityList.value;
			const idx = entityList.findIndex(
				(e) => e?.entity?.entityData?.meta?.id === String(trackId),
			);
			if (idx !== -1) {
				player.setEntityByIndex(idx);
				player.play();
			} else {
				console.warn(
					"[nextmusicApi] Track not found in queue:",
					trackId,
				);
			}
		} catch (err) {
			console.warn(
				`[nextmusicApi] Cannot start track ${trackId}: ${err.message}`,
			);
		}
	}, 100);

	return true;
}

function getCurrentTrack() {
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
		albumTitle: meta.albums?.[0]?.title ?? null,
		year: meta.albums?.[0]?.year ?? null,
		coverUrl,
		trackUrl: `https://music.yandex.ru/track/${meta.id}`,
		durationMs: meta.durationMs ?? null,
		contentWarning: meta.contentWarning ?? null,
	};
}

function getState() {
	const player = getActivePlayer();
	if (!player) return null;
	const ps = player.playbackState;
	return {
		playerId: player.id,
		status: ps?.playerState?.status?.value,
		progress: ps?.playerState?.progress?.value,
		volume: ps?.playerState?.volume?.value,
		shuffle: ps?.playerState?.shuffle?.value,
		repeat: ps?.playerState?.repeatMode?.value,
	};
}
