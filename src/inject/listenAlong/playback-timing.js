let playStateTimer = null;
let timelinePollTimer = null;
let trackObserverTimer = null;
let queuePollTimer = null;

function playerStatus() {
	return window.nextmusicApi?.getState?.()?.status ?? null;
}

function isPlayingNow() {
	const status = playerStatus();
	if (status == null) return null;
	return status === "playing" || status === "buffering";
}

function startPlayback() {
	const api = window.nextmusicApi;
	if (playerStatus() === "paused") api?.resume?.();
	else api?.play?.();
}

let _audioTiming = null;
let _audioBuffering = false;

function onAudioEvent(ev) {
	if (ev.type === "waiting" || ev.type === "stalled") {
		_audioBuffering = true;
	} else if (
		ev.type === "canplay" ||
		ev.type === "playing" ||
		ev.type === "timeupdate"
	) {
		_audioBuffering = false;
	}

	if (typeof ev.currentTime !== "number") return;
	_audioTiming = {
		currentTime: ev.currentTime,
		playbackRate: ev.playbackRate,
		at: Date.now(),
	};
}

window.nextmusicApi?.onAudioEvent?.(onAudioEvent);

function getPosition() {
	if (_audioTiming && Date.now() - _audioTiming.at < AUDIO_TIMING_STALE_MS) {
		return _audioTiming.currentTime;
	}

	const pos = window.nextmusicApi?.getState?.()?.progress?.position;
	return typeof pos === "number" ? pos : null;
}

let _syncSeekFlagTimer = null;

function seekTo(seconds) {
	const api = window.nextmusicApi;

	if (typeof api?.setProgress !== "function") {
		console.warn("Listen Along: nextmusicApi.setProgress unavailable");
		return;
	}

	window.__liSyncSeeking = true;
	clearTimeout(_syncSeekFlagTimer);
	_syncSeekFlagTimer = setTimeout(() => {
		window.__liSyncSeeking = false;
	}, 1500);

	Promise.resolve(api.setProgress(seconds)).catch((err) => {
		console.warn("Listen Along: seek failed", err);
	});
}

let syncTarget = null;
let driftTimer = null;
let appliedRate = 1;

function setRate(rate) {
	const next = Math.round(rate * 1000) / 1000;
	if (next === appliedRate) return;

	const api = window.nextmusicApi;
	if (typeof api?.setSpeed !== "function") return;

	appliedRate = next;
	try {
		api.setSpeed(next);
	} catch (err) {
		console.warn("Listen Along: setSpeed failed", err);
	}
}

function resetRate() {
	setRate(1);
}

let localAnchor = null;

function localPositionNow() {
	const raw = getPosition();
	if (raw === null) {
		localAnchor = null;
		return null;
	}

	if (!localAnchor || raw !== localAnchor.position) {
		localAnchor = { position: raw, at: Date.now() };
	}

	const ahead = Math.min((Date.now() - localAnchor.at) / 1000, 0.5);

	return localAnchor.position + ahead * appliedRate;
}

function hostPositionNow() {
	if (!syncTarget) return null;
	if (!syncTarget.playing) return syncTarget.position;

	return syncTarget.position + (Date.now() - syncTarget.stamp) / 1000;
}

function driftSuspended() {
	return (
		isHost() ||
		!isConnected() ||
		isInitializing ||
		isSyncPaused ||
		isNavigating ||
		isNavSettling ||
		isSeekingTimeline ||
		deviatedFromHost ||
		_audioBuffering ||
		!syncTarget ||
		!syncTarget.playing ||
		playerStatus() !== "playing" ||
		(!!syncTarget.trackId && syncTarget.trackId !== getAlbumPath())
	);
}

function driftTick() {
	if (driftSuspended()) {
		resetRate();
		return;
	}

	const local = localPositionNow();
	const target = hostPositionNow();
	if (local === null || target === null) {
		resetRate();
		return;
	}

	const diff = target - local;
	const off = Math.abs(diff);

	if (off > HARD_SEEK_SEC) {
		resetRate();
		hardSeekTo(target);
		return;
	}

	if (off < DRIFT_DEADBAND_SEC) {
		resetRate();
		return;
	}

	const deviation = Math.max(
		-MAX_RATE_DEVIATION,
		Math.min(MAX_RATE_DEVIATION, diff / DRIFT_CLOSE_SEC),
	);

	setRate(1 + deviation);
}

function hardSeekTo(seconds) {
	localAnchor = null;
	isSeekingTimeline = true;
	seekTo(seconds);
	setTimeout(() => {
		isSeekingTimeline = false;
	}, 1200);
}

function startDriftControl() {
	if (driftTimer) return;
	driftTimer = setInterval(driftTick, DRIFT_TICK_MS);
}

window.addEventListener("beforeunload", resetRate);
