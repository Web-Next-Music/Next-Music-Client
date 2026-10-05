function markDeviated(what) {
	if (isHost() || deviatedFromHost) return;
	deviatedFromHost = true;
}

function sendPlayState(playing) {
	if (isInitializing || isSyncPaused || isSeekingTimeline) return;

	if (!getAlbumPath()) return;
	if (playing === lastSentPlaying) return;

	lastSentPlaying = playing;

	if (!isHost()) {
		markDeviated("play/pause");
		return;
	}

	if (!isConnected()) return;

	LA.send({ type: "playstate", playing, roomId: ROOM_ID });
}

function applyPlayState(wantPlay) {
	if (isHost()) return;

	const api = window.nextmusicApi;
	const currentlyPlaying = isPlayingNow();

	if (currentlyPlaying === null) return;
	if (currentlyPlaying === wantPlay) return;

	isApplyingState = true;
	lastSentPlaying = wantPlay;

	if (wantPlay) startPlayback();
	else api?.pause?.();

	setTimeout(() => {
		const now = isPlayingNow();
		if (now !== null) lastSentPlaying = now;
		isApplyingState = false;
	}, 800);
}

function startPlayStateObserver() {
	if (_playStateObserverStarted) return;
	_playStateObserverStarted = true;

	let lastPlaying = null;

	function check() {
		if (isApplyingState || isNavigating || isNavSettling || isSyncPaused)
			return;
		if (!getAlbumPath()) return;
		const playing = isPlayingNow();
		if (playing === null || playing === lastPlaying) return;
		lastPlaying = playing;
		sendPlayState(playing);
	}

	window.nextmusicApi?.onStatusChange?.(() => check());

	playStateTimer = setInterval(check, 1000);
}

function startTimelineObserver() {
	if (_timelineObserverStarted) return;
	_timelineObserverStarted = true;

	const JUMP_THRESHOLD_SEC = 1.5;

	let lastPosition = null;
	let lastPositionAt = 0;

	function onPosition(position) {
		const now = Date.now();
		const prev = lastPosition;
		const elapsed = (now - lastPositionAt) / 1000;

		lastPosition = position;
		lastPositionAt = now;

		if (prev === null) return;

		const drift = Math.abs(position - prev - elapsed);
		if (drift < JUMP_THRESHOLD_SEC) return;

		if (position < 1 && prev > 1) return;

		if (isInitializing || isNavigating || isSyncPaused) return;

		if (window.__liSyncSeeking || isSeekingTimeline) return;

		if (!isHost()) {
			markDeviated("seek");
			return;
		}

		const val = Math.round(position);
		if (!isNaN(val) && isConnected()) {
			LA.send({ type: "seek", position: val, roomId: ROOM_ID });
		}
	}

	const api = window.nextmusicApi;
	let lastObservableAt = 0;

	api?.onProgressChange?.((progress) => {
		if (typeof progress?.position !== "number") return;
		lastObservableAt = Date.now();
		onPosition(progress.position);
	});

	timelinePollTimer = setInterval(() => {
		if (Date.now() - lastObservableAt < 2000) return;
		const pos = getPosition();
		if (pos !== null) onPosition(pos);
	}, 500);
}
