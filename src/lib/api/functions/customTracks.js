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
				transport: "raw",
				gain: false,
				size: 0,
			},
		};
	}

	function stillOwnsEntity() {
		return (
			entity._customTrackId === String(trackId) &&
			String(entity.entityData?.meta?.id) === String(trackId)
		);
	}

	entity.mediaSourceData = buildMediaSource();

	let _msd = entity.mediaSourceData;
	let guarded = false;

	Object.defineProperty(entity, "mediaSourceData", {
		get() {
			return _msd;
		},
		set(v) {
			if (!stillOwnsEntity()) {
				delete entity.mediaSourceData;
				entity.mediaSourceData = v;
				return;
			}

			if (!guarded) {
				guarded = true;
				_msd = v;
				setTimeout(() => {
					if (stillOwnsEntity()) _msd = buildMediaSource();
				}, 0);
			} else {
				_msd = buildMediaSource();
			}
		},
		configurable: true,
	});
}

function updateCustomTrackDuration(trackId, durationMs) {
	const normalizedDurationMs = Math.max(
		0,
		Math.round(Number(durationMs) || 0),
	);
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

function ugcTrackId(url) {
	let h = 0x811c9dc5;
	for (let i = 0; i < url.length; i++) {
		h ^= url.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return "ugc:" + h.toString(36);
}

function playUgcTrack(payload) {
	if (!payload?.url) return;

	const id = ugcTrackId(payload.url);

	playCustomTrack({
		id,
		url: payload.url,
		title: payload.title || "Shared Track",
		artists: payload.artist ? [{ id: 0, name: payload.artist }] : [],
		cover: payload.cover,
	});

	return id;
}

function playCustomTrack(trackData) {
	const id = String(trackData.id);
	const durationMs = Math.max(
		0,
		Math.round(Number(trackData.durationMs) || 0),
	);

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

	const meta = {
		id,
		realId: id,
		title: trackData.title ?? "Custom Track",
		type: "music",
		artists: trackData.artists ?? [],
		albums: trackData.albumId ? [{ id: trackData.albumId }] : [],
		coverUri: trackData.cover ?? trackData.coverUri ?? "",
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

	let attempts = 0;
	const tryApplyMediaSource = () => {
		attempts++;
		const idx = applyCustomTrackToQueue(id, queue);
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
