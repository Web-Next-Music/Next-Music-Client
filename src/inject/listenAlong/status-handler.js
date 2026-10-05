function handleStatus(next) {
	const wasConnected = connection.connected;

	connection = { ...connection, ...next };
	if (next.discordUserId) SELF_DISCORD_ID = next.discordUserId;

	if (connection.connected && !wasConnected) {
		deviatedFromHost = false;

		for (const peer of next.peers ?? []) {
			upsertAvatar(peer.discordUserId, peer.avatarUrl, peer.name || null);
		}

		if (
			SELF_DISCORD_ID &&
			connection.roomId &&
			!islandAvatars.has(SELF_DISCORD_ID)
		) {
			upsertAvatar(SELF_DISCORD_ID, null);
		}

		LA.listRooms?.().then((res) => {
			connection.roomList = res?.rooms || [];
			renderPanel();
		});

		startObserver();
		startPlayStateObserver();
		startTimelineObserver();
		startDriftControl();

		if (isHost()) {
			setTimeout(() => {
				forceSendCurrentTrack();
				debouncedQueueSync(true);
			}, 250);
		}

		clearTimeout(initTimeout);
		initTimeout = setTimeout(liftInitializing, 5000);
	}

	if (!connection.connected && wasConnected) {
		clearTimeout(initTimeout);
		isInitializing = true;
		serverState = null;
		syncTarget = null;
		resetRate();
		clearAvatars();
		connection.roomList = [];
	}

	renderPanel();
}

LA.onMessage(handleMessage);
LA.onStatus(handleStatus);

window.nextmusicApi?.onStatusChange?.(() => renderPanel());
window.nextmusicApi?.onTrackChange?.(() => renderPanel());

renderPanel();
startInviteWatch();

handleStatus(initial ?? {});
