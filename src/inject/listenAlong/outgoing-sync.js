const SEND_DELAY_MS = 1000;
let _navigateTimer = null;

function debouncedNavigate(p) {
	clearTimeout(_navigateTimer);
	_navigateTimer = setTimeout(() => {
		if (!isHost() || !isConnected()) return;

		lastSentPath = p;

		const message = { type: "navigate", trackId: p, roomId: ROOM_ID };
		const ugc = ugcByTrackId.get(p);
		if (p.startsWith(UGC_PREFIX) && ugc) message.ugc = ugc;

		// Read the position only once the debounce settles, not when the
		// switch was first noticed - by send time this is the position
		// on the track we're actually sending, not a stale earlier one.
		const pos = getPosition();
		if (typeof pos === "number") message.position = pos;

		LA.send(message);
	}, SEND_DELAY_MS);
}

const QUEUE_SEND_DELAY_MS = 800;
let _queueTimer = null;

function debouncedQueueSync(force = false) {
	clearTimeout(_queueTimer);
	_queueTimer = setTimeout(
		() => {
			if (!isHost() || !isConnected()) return;

			const snap = window.nextmusicApi?.getQueueSnapshot?.();
			if (!snap?.queue?.length) return;
			if (!force && sameQueue(snap.queue, lastSentQueue)) return;

			const queue = snap.queue.map((entry) => {
				const ugc = ugcByTrackId.get(entry.trackId);
				return ugc ? { ...entry, ugc } : entry;
			});

			lastSentQueue = snap.queue;

			LA.send({
				type: "queue_sync",
				roomId: ROOM_ID,
				queue,
				queueIndex: snap.index,
			});
		},
		force ? 0 : QUEUE_SEND_DELAY_MS,
	);
}

function trySend(p) {
	if (!p || isInitializing || isNavigating || isSyncPaused) return;
	if (p === _suppressSend) {
		_suppressSend = null;
		lastSentPath = p;
		clearTimeout(_navigateTimer);
		return;
	}
	const serverPath = serverState?.trackId ?? null;
	if (p === lastSentPath) {
		clearTimeout(_navigateTimer);
		return;
	}
	if (p === serverPath) {
		lastSentPath = p;
		clearTimeout(_navigateTimer);
		return;
	}

	if (!isHost()) {
		lastSentPath = p;
		markDeviated("track");
		return;
	}

	debouncedNavigate(p);
}

function resumeSync() {
	if (!isSyncPaused) return;

	isSyncPaused = false;

	renderPanel();

	if (isHost()) return;

	if (serverState) {
		const currentId = getTrackId();
		const srvId = serverState.trackId;
		const needsNav = srvId && srvId !== currentId;

		if (needsNav) {
			_pendingSyncAfterNav = true;
		}

		applySyncState(serverState, true);
	}

	if (isHost()) debouncedQueueSync(true);
}

function pauseSyncNoTrack(reason) {
	if (isSyncPaused) return;
	isSyncPaused = true;
	_pendingSyncAfterNav = false;
	renderPanel();
}
