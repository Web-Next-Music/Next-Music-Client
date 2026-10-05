function applySyncState(msg, force = false, forceSeek = force) {
	if (isHost()) return;

	const targetPath = msg.trackId ?? null;
	const targetPlaying = msg.playing;
	const targetPosition = msg.position;
	const targetServerTime = msg.serverTime;

	const currentPath = getAlbumPath();

	const needNav =
		targetPath &&
		targetPath !== currentPath &&
		(force || targetPath !== lastSentPath) &&
		!isNavigating;

	if (needNav) {
		if (serverState && serverState.trackId !== targetPath) {
			console.warn(
				`Nav cancelled: msg.trackId="${targetPath}" != serverState.trackId="${serverState.trackId}"`,
			);
			applySyncState(serverState, force);
			return;
		}

		_suppressSend = targetPath;
		pendingPath = targetPath;

		processNext();
	}

	syncTarget = {
		trackId: targetPath,
		position: targetPosition,
		stamp: targetServerTime || Date.now(),
		playing: !!targetPlaying,
	};

	if (needNav || isNavigating) return;

	let willHardSeek = false;
	let targetPos = null;

	if (!isSeekingTimeline) {
		const current = getPosition();
		targetPos = hostPositionNow();

		if (current !== null && targetPos !== null) {
			const diff = Math.abs(current - targetPos);
			willHardSeek = forceSeek || diff > HARD_SEEK_SEC;
		}
	}

	if (willHardSeek) {
		hardSeekTo(targetPos);
		setTimeout(() => {
			if (isNavigating || isApplyingState) return;
			applyPlayState(targetPlaying);
		}, 1250);
	} else if (!isApplyingState) {
		applyPlayState(targetPlaying);
	}
}

function handleStateSync(msg) {
	serverState = msg;

	if (msg.trackId && msg.ugc) ugcByTrackId.set(msg.trackId, msg.ugc);

	if (isInitializing) {
		clearTimeout(initTimeout);
		initTimeout = setTimeout(liftInitializing, 1500);
	}

	if (isHost()) {
		lastSentPath = msg.trackId ?? lastSentPath;
		return;
	}

	const fromHost = !!connection.hostId && msg.by === connection.hostId;
	const fromServerAdmin = msg.by === "server" || msg.by === "server-admin";

	if (fromHost || fromServerAdmin) {
		deviatedFromHost = false;
	} else if (deviatedFromHost) {
		return;
	}

	if (isSyncPaused) {
		if (!msg.trackId) {
			return;
		}
		isSyncPaused = false;
		renderPanel();
	}

	applySyncState(msg, fromHost, fromHost || isInitializing);
	renderPanel();
}

function sameQueue(a, b) {
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i].trackId !== b[i].trackId) return false;
	}
	return true;
}

function handleQueueSync(msg) {
	if (isHost()) return;
	if (!Array.isArray(msg.queue) || msg.queue.length === 0) return;

	if (sameQueue(msg.queue, lastAppliedQueue)) return;
	lastAppliedQueue = msg.queue;

	window.nextmusicApi?.applyIncomingQueue?.(msg.queue, msg.queueIndex);
}

function handleMessage(msg) {
	if (!msg || typeof msg.type !== "string") return;

	switch (msg.type) {
		case "version_unsupported":
			toast(msg.message || "Client version not supported");
			break;

		case "server_info":
			connection.serverName = msg.name || connection.serverName;
			connection.serverVersion = msg.version || connection.serverVersion;
			connection.serverDescription =
				msg.description || connection.serverDescription;
			connection.serverCover = msg.cover || connection.serverCover;
			connection.minClientVersion =
				msg.minClientVersion || connection.minClientVersion;
			connection.maxClientVersion =
				msg.maxClientVersion || connection.maxClientVersion;
			connection.roomId = msg.roomId || null;
			connection.roomName = msg.roomName || null;
			connection.hostId = msg.hostId || null;
			if (msg.discordUserId) SELF_DISCORD_ID = msg.discordUserId;
			if (SELF_DISCORD_ID && connection.roomId) {
				upsertAvatar(SELF_DISCORD_ID, null, null);
			}
			renderPanel();
			break;

		case "room_renamed":
			connection.roomName = msg.roomName || null;
			renderPanel();
			break;

		case "room_list":
			connection.roomList = msg.rooms || [];
			renderPanel();
			break;

		case "room_left":
			connection.roomId = null;
			connection.roomName = null;
			connection.hostId = null;
			connection.isHost = false;
			connection.isCreator = false;
			clearAvatars();
			renderPanel();
			LA.listRooms?.().then((res) => {
				connection.roomList = res?.rooms || [];
				renderPanel();
			});
			break;

		case "auth_result":
			if (!msg.ok) {
				console.warn("Listen Along: auth token rejected");
			} else if (msg.isHost) {
			}
			break;

		case "host_changed":
			connection.hostId = msg.hostId || null;
			renderPanel();
			if (msg.hostId && msg.hostId === SELF_DISCORD_ID) {
				setTimeout(() => {
					forceSendCurrentTrack();
					debouncedQueueSync(true);
				}, 250);
			}
			break;

		case "state_sync":
			handleStateSync(msg);
			break;

		case "queue_sync":
			handleQueueSync(msg);
			break;

		case "client_joined":
			upsertAvatar(
				msg.discordUserId,
				msg.avatarUrl || null,
				msg.name || null,
			);
			break;

		case "client_left":
			removeAvatar(msg.discordUserId);
			break;

		case "avatar":
			upsertAvatar(
				msg.discordUserId,
				msg.avatarUrl || null,
				msg.name || null,
			);
			break;

		case "error":
			console.warn(`❌ Server error [${msg.code}]:`, msg.message);
			break;
	}
}
