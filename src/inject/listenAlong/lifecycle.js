	function startObserver() {
		if (observerStarted) return;
		observerStarted = true;
		const init = getAlbumPath();

		let lastPolledPath = init || null;

		if (!init) {
			pauseSyncNoTrack("No track on start");
		}

		function onTrack() {
			const p = getAlbumPath();

			if (!p) {
				if (!isSyncPaused && !isNavigating)
					pauseSyncNoTrack("Track disappeared");
				return;
			}

			if (isSyncPaused && !isNavigating) {
				resumeSync();
			}

			if (isInitializing || isNavigating || isSyncPaused) return;
			if (p === lastPolledPath) return;
			lastPolledPath = p;
			trySend(p);
		}

		const api = window.nextmusicApi;

		if (typeof api?.onTrackChange === "function") {
			api.onTrackChange(() => onTrack());
		} else {
			console.warn(
				"Listen Along: onTrackChange unavailable, polling only",
			);
		}

		trackObserverTimer = setInterval(onTrack, 1000);

		window.nextmusicApi?.onQueueChange?.(() => {
			if (isHost()) debouncedQueueSync();
		});

		queuePollTimer = setInterval(() => {
			if (isHost()) debouncedQueueSync();
		}, 3000);
	}

	function stopListenAlong() {
		if (driftTimer) {
			clearInterval(driftTimer);
			driftTimer = null;
		}
		if (playStateTimer) {
			clearInterval(playStateTimer);
			playStateTimer = null;
		}
		if (timelinePollTimer) {
			clearInterval(timelinePollTimer);
			timelinePollTimer = null;
		}
		if (trackObserverTimer) {
			clearInterval(trackObserverTimer);
			trackObserverTimer = null;
		}
		if (queuePollTimer) {
			clearInterval(queuePollTimer);
			queuePollTimer = null;
		}
		document.removeEventListener("keydown", onPanelHotkey);
		window.nextmusicApi?.unmountListenAlongPanel?.();
	}

	window.stopListenAlong = stopListenAlong;
})();
