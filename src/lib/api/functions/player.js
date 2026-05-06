const VE = findModuleExport(appRequire, "VE");
const _foundPlayers = searchFiber(
	(document.getElementById("__next") || document.body)[
		Object.keys(document.getElementById("__next") || document.body).find((k) =>
			k.startsWith("__reactFiber"),
		)
	],
	VE,
);
window._ymPlayers = [...new Map(_foundPlayers.map((p) => [p.id, p])).values()];

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
			if (state.memoizedState instanceof cls) players.push(state.memoizedState);
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
		if (ent && (ent.entityData?.meta?.id === id || ent._customTrackId === id)) {
			watchEntityForCustomTrack(ent, id);
			ent._customTrackId = id;
			return i;
		}
	}
	return -1;
}

function playTrackById(trackId) {
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

	const artists = (meta.artists ?? []).map((a) => ({ id: a.id, name: a.name }));

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
}

function getState() {
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
}
