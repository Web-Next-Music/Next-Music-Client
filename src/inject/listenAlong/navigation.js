function processNext() {
	if (!pendingPath) return;
	const p = pendingPath;
	pendingPath = null;
	navigateAndPlay(p);
}

function navigateAndPlay(p) {
	if (_navigatingToPath === p) {
		return;
	}

	const srvId = serverState?.trackId ?? null;
	if (srvId && srvId !== p) {
		console.warn(`Nav to "${p}" aborted - server now wants "${srvId}"`);
		pendingPath = srvId;
		processNext();
		return;
	}

	const currentId = getTrackId();
	if (currentId === p) {
		_suppressSend = p;
		lastSentPath = p;
		if (serverState) {
			setTimeout(() => applySyncState(serverState, true), 50);
		}
		return;
	}

	if (p.startsWith(UGC_PREFIX)) {
		const ugc =
			ugcByTrackId.get(p) ??
			(serverState?.trackId === p ? serverState.ugc : null);

		if (!ugc?.u) {
			console.warn(`No UGC payload for "${p}", cannot play`);
			return;
		}

		ugcByTrackId.set(p, ugc);

		_navigatingToPath = p;
		isNavigating = true;

		if (
			!tryPlay(() =>
				window.nextmusicApi.playCustomTrack({
					id: p,
					url: ugc.u,
					title: ugc.t || "Shared Track",
					artists: ugc.a ? [{ id: 0, name: ugc.a }] : [],
					cover: ugc.c,
				}),
			)
		)
			return;
	} else {
		_navigatingToPath = p;
		isNavigating = true;

		if (!tryPlay(() => window.nextmusicApi.playTrackById(p))) return;
	}

	waitForTrackAndPlay(p);
}

function tryPlay(run) {
	let failure = null;

	try {
		if (run() === false) failure = "playback refused";
	} catch (err) {
		failure = err.message;
	}

	if (!failure) return true;

	console.warn(`Navigation aborted: ${failure}`);
	_navigatingToPath = null;
	isNavigating = false;
	return false;
}

function finishNavigation() {
	_navigatingToPath = null;
	isNavigating = false;
	processNext();
	if (serverState && !isHost()) {
		const wasPendingResume = _pendingSyncAfterNav;
		_pendingSyncAfterNav = false;
		isNavSettling = true;
		setTimeout(
			() => {
				applySyncState(serverState, true);
				setTimeout(() => {
					isNavSettling = false;
				}, 500);
			},
			wasPendingResume ? 120 : 150,
		);
	}
}

function waitForTrackAndPlay(expectedId) {
	let attempts = 0;
	const wait = setInterval(() => {
		if (pendingPath && pendingPath !== expectedId) {
			clearInterval(wait);
			console.warn(
				`Nav interrupted: new trackId "${pendingPath}" overrides "${expectedId}"`,
			);
			isNavigating = false;
			_navigatingToPath = null;
			processNext();
			return;
		}

		const srvId = serverState?.trackId ?? null;
		if (srvId && srvId !== expectedId) {
			clearInterval(wait);
			console.warn(
				`waitForTrackAndPlay: server switched to "${srvId}" while waiting for "${expectedId}"`,
			);
			isNavigating = false;
			_navigatingToPath = null;
			pendingPath = srvId;
			processNext();
			return;
		}

		const currentId = getTrackId();
		const state = window.nextmusicApi?.getState?.();
		const isPlaying = state?.status === "playing";

		if (currentId === expectedId) {
			clearInterval(wait);
			setTimeout(() => finishNavigation(), 150);
			return;
		}

		if (++attempts >= 130) {
			clearInterval(wait);
			console.warn(
				`⚠️ Timed out waiting for trackId "${expectedId}" (got "${currentId}")`,
			);
			finishNavigation();
		}
	}, 150);
}
