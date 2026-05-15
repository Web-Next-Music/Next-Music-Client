function refreshPlayers() {
	const req = getAppRequire();
	const cls = findModuleExport(req, "VE");
	if (typeof cls !== "function") return [];

	const root = document.getElementById("__next") || document.body;
	const fiberKey = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
	if (!fiberKey) return [];

	const foundPlayers = searchFiber(root[fiberKey], cls);
	window._ymPlayers = [
		...new Map(foundPlayers.map((player) => [player.id, player])).values(),
	];

	return window._ymPlayers;
}

function getMainPlayer() {
	const cached = window._ymPlayers?.find((p) => p.id === "MAIN");
	if (cached) return cached;

	return refreshPlayers().find((p) => p.id === "MAIN");
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
