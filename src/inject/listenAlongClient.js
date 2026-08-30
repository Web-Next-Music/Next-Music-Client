(async () => {
	const LA = window.nmcListenAlong;

	if (!LA) {
		console.warn("Listen Along: bridge unavailable, not starting.");
		return;
	}

	const HARD_SEEK_SEC = 2;
	const DRIFT_DEADBAND_SEC = 0.05;
	const DRIFT_CLOSE_SEC = 8;
	const MAX_RATE_DEVIATION = 0.05;
	const DRIFT_TICK_MS = 250;
	const AUDIO_TIMING_STALE_MS = 1500;

	const UGC_PREFIX = "ugc:";
	const UUID_RE =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	const initial = await LA.getConfig();

	const ROOM_ID = initial?.roomId || null;
	let SELF_DISCORD_ID = initial?.discordUserId || null;

	let connection = {
		connected: false,
		connecting: false,
		serverName: null,
		serverVersion: null,
		serverDescription: null,
		serverCover: null,
		minClientVersion: null,
		maxClientVersion: null,
		serverLabel: "",
		roomId: null,
		roomName: null,
		isHost: false,
		hostId: null,
		isCreator: false,
		roomList: [],
		fatal: null,
		isAdmin: false,
		webPanelUrl: null,
	};

	let observerStarted = false;
	let _playStateObserverStarted = false;
	let _timelineObserverStarted = false;

	let lastSentPath = null;
	let isNavigating = false;
	let _navigatingToPath = null;
	let pendingPath = null;
	let _pendingSyncAfterNav = false;
	let isApplyingState = false;
	let lastSentPlaying = null;
	let isSeekingTimeline = false;
	let isInitializing = true;
	let initTimeout = null;
	let serverState = null;
	let isSyncPaused = false;
	let _suppressSend = null;

	let deviatedFromHost = false;
	let isNavSettling = false;

	const ugcByTrackId = new Map();
	let lastSentQueue = null;
	let lastAppliedQueue = null;

	function isHost() {
		return connection.isHost;
	}

	function isConnected() {
		return connection.connected;
	}

	function liftInitializing() {
		if (!isInitializing) return;
		isInitializing = false;

		const playing = isPlayingNow();

		if (playing !== null) lastSentPlaying = playing;

		if (serverState?.trackId) {
			lastSentPath = serverState.trackId;
		} else {
			const p = getTrackId();
			if (p) lastSentPath = p;
		}
	}

	async function copyInvite() {
		const code = await LA.invite?.();
		if (!code) {
			toast("No room to share yet");
			return;
		}

		try {
			await navigator.clipboard.writeText(code);
			toast("Invite copied - paste it to a friend");
		} catch {
			console.warn("Listen Along invite:", code);
			toast("Invite is in the console");
		}
	}

	function toast(message) {
		const api = window.nextmusicApi;
		try {
			api?.showErrorToast?.(message, api?.ContainerId?.INFO);
		} catch {}
	}

	const INVITE_PREFIX = "NMJ-";
	const INVITE_URL_PREFIX = "nextmusic://";
	let lastJoinedCode = null;

	function looksLikeInvite(text) {
		return (
			text.startsWith(INVITE_PREFIX) || text.startsWith(INVITE_URL_PREFIX)
		);
	}

	function startInviteWatch() {
		document.addEventListener(
			"paste",
			(event) => {
				const text = event.clipboardData?.getData("text/plain");
				const code = text?.trim();
				if (!code || !looksLikeInvite(code)) return;

				event.preventDefault();

				if (code === lastJoinedCode) return;
				lastJoinedCode = code;

				LA.join?.(code).then((res) => {
					if (!res?.ok) {
						toast("That invite code is not valid");
						lastJoinedCode = null;
						return;
					}
					if (res.already) {
						toast("You're already connected to this room");
						return;
					}
					toast(`Joining ${res.roomId} on ${res.host}`);
				});
			},
			true,
		);

		LA.onJoinedByLink?.((res) => {
			if (!res?.ok) {
				toast("That invite link is not valid");
				return;
			}
			if (res.already) {
				toast("You're already connected to this room");
				return;
			}
			toast(`Joining ${res.roomId} on ${res.host}`);
		});
	}

	function serverDisplayName() {
		return connection.serverName || connection.serverLabel || "server";
	}

	function islandState() {
		if (connection.fatal === "no-server" || connection.fatal === "no-room")
			return { hidden: true };

		if (connection.fatal === "room-not-found") {
			return {
				dot: "disconnected",
				text: serverDisplayName(),
				color: "#e05c5c",
			};
		}

		if (connection.connected) {
			if (isSyncPaused) {
				return {
					dot: "sync-paused",
					text: serverDisplayName(),
					color: "#f5a623",
				};
			}

			return {
				dot: "connected",
				text: "",
				color: "#1db954",
			};
		}

		if (connection.connecting) {
			return {
				dot: "connecting",
				text: serverDisplayName(),
				color: "#888",
			};
		}

		return {
			dot: "disconnected",
			text: serverDisplayName(),
			color: "#888",
		};
	}

	function panelHandlers() {
		return {
			onClose: closePanel,
			onSend: sendChatMessage,
			onToggleConnect: () => {
				if (connection.connected || connection.connecting) {
					LA.disconnect();
				} else {
					LA.connect();
				}
			},
			onInvite: copyInvite,
			onPlayTrack: (trackId) => {
				if (!isHost() || !trackId) return;
				const api = window.nextmusicApi;
				const current = api?.getCurrentTrack?.();
				if (current?.id === trackId) {
					api?.togglePause?.();
				} else {
					api?.playTrackById?.(trackId);
				}
			},
			onMakeHost: (targetId) => {
				if (!isHost() || !targetId || targetId === SELF_DISCORD_ID)
					return;
				LA.transferHost?.(targetId);
			},
			onCopyUserId: async (discordId) => {
				if (!discordId) {
					toast("This user hasn't signed in with Discord yet");
					return;
				}
				try {
					await navigator.clipboard.writeText(discordId);
					toast("Discord user ID copied");
				} catch {
					console.warn("Listen Along user ID:", discordId);
					toast("User ID is in the console");
				}
			},
			onKick: (discordId) => {
				if (!connection.isCreator || !discordId) return;
				LA.kick?.(discordId);
			},
			onBan: (discordId) => {
				if (!connection.isCreator || !discordId) return;
				LA.ban?.(discordId);
			},
			onOpenSettings: () => LA.openSettings?.("programSettings"),
			onCreateRoom: async (name) => {
				const res = await LA.createRoom?.(name);
				if (!res?.ok) {
					toast(res?.reason || "Could not create a room");
				}
				return res;
			},
			onLeaveRoom: async () => {
				const res = await LA.leaveRoom?.();
				if (!res?.ok) toast("Could not leave the room");
				return res;
			},
			onSetRoomName: (name) => {
				if (!connection.isCreator) return;
				LA.setRoomName?.(name);
			},
			onJoinRoom: async (roomId) => {
				const res = await LA.joinRoom?.(roomId);
				if (!res?.ok) toast(res?.reason || "Could not join the room");
				return res;
			},
		};
	}

	function hostColorFromId(id) {
		return id ? "#1db954" : "#888";
	}

	function panelState() {
		const view = islandState();
		const notConfigured = view.hidden;
		const serverNowPlaying = isHost()
			? {
					id: getShareableTrack()?.trackId ?? null,
					playing: isPlayingNow() === true,
					position:
						window.nextmusicApi?.getState?.()?.progress?.position ??
						0,
					serverTime: Date.now(),
					ugc: null,
				}
			: {
					id: serverState?.trackId ?? null,
					playing: !!serverState?.playing,
					position: serverState?.position ?? 0,
					serverTime: serverState?.serverTime ?? Date.now(),
					ugc: null,
				};
		if (serverNowPlaying.id) {
			serverNowPlaying.ugc =
				ugcByTrackId.get(serverNowPlaying.id) ?? null;
		}
		return {
			dot: notConfigured ? "disconnected" : view.dot,
			color: notConfigured ? "#888" : view.color,
			text: notConfigured
				? "Not connected"
				: view.text || serverDisplayName(),
			serverVersion: notConfigured ? null : connection.serverVersion,
			serverDescription: notConfigured
				? null
				: connection.serverDescription,
			serverCover: notConfigured ? null : connection.serverCover,
			minClientVersion: notConfigured
				? null
				: connection.minClientVersion,
			maxClientVersion: notConfigured
				? null
				: connection.maxClientVersion,
			webPanelUrl: notConfigured ? null : connection.webPanelUrl,
			connected: connection.connected,
			connecting: connection.connecting,
			isHost: isHost(),
			isCreator: connection.isCreator,
			roomId: connection.roomId,
			roomName: connection.roomName,
			roomList: connection.roomList,
			discordLinked: !!connection.discordLinked,
			avatars: buildAvatarList(),
			chat: chatMessages,
			hostColor: hostColorFromId(connection.hostId),
			nowPlaying: serverNowPlaying,
		};
	}

	let _panelOpen = false;

	function renderPanel() {
		if (!_panelOpen) return;
		window.nextmusicApi?.updateListenAlongPanel?.(panelState());
	}

	function openPanel() {
		_panelOpen = true;
		window.nextmusicApi?.mountListenAlongPanel?.(
			panelState(),
			panelHandlers(),
		);
	}

	function closePanel() {
		_panelOpen = false;
		window.nextmusicApi?.unmountListenAlongPanel?.();
	}

	function togglePanel() {
		if (_panelOpen) closePanel();
		else openPanel();
	}

	function isTypingTarget(el) {
		if (!el) return false;
		const tag = el.tagName;
		return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
	}

	function onPanelHotkey(event) {
		if (event.ctrlKey || event.altKey || event.metaKey) return;
		if (event.code !== "KeyZ") return;
		if (isTypingTarget(document.activeElement)) return;

		event.preventDefault();
		togglePanel();
	}

	document.addEventListener("keydown", onPanelHotkey);

	let chatMessages = initial?.chatHistory ?? [];
	const CHAT_HISTORY_CAP = 50;

	const CHAT_TEXT_MAX_LEN = 2000;

	function sendChatMessage(text) {
		const trimmed = (text || "").trim();
		if (!trimmed || trimmed.length > CHAT_TEXT_MAX_LEN) return;
		LA.sendChatMessage?.(trimmed);
	}

	LA.onChatHistory?.((msg) => {
		chatMessages = (msg?.messages ?? []).slice(-CHAT_HISTORY_CAP);
		renderPanel();
	});

	LA.onChatMessage?.((msg) => {
		if (!msg) return;
		chatMessages = [...chatMessages, msg].slice(-CHAT_HISTORY_CAP);
		renderPanel();
		notifyChatMessage(msg);
	});

	let chatNotifySound = null;
	const NOTIFY_VOLUME_KEY = "nmc-la-notify-volume";

	function getChatNotifyVolume() {
		const raw = Number.parseFloat(localStorage.getItem(NOTIFY_VOLUME_KEY));
		return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
	}

	function playChatNotifySound() {
		try {
			const volume = getChatNotifyVolume();
			if (volume <= 0) return;
			const port = window.__nextmusicApiAssetPort ?? 2007;
			if (!chatNotifySound) {
				chatNotifySound = new Audio(
					`http://127.0.0.1:${port}/app_asset/sounds/combobreak.mp3`,
				);
			}
			chatNotifySound.currentTime = 0;
			chatNotifySound.volume = volume;
			chatNotifySound.play().catch(() => {});
		} catch {}
	}

	function notifyChatMessage(msg) {
		if (!msg || msg.discordUserId === SELF_DISCORD_ID) return;
		if (_panelOpen) return;

		const api = window.nextmusicApi;
		const text = (msg.text || "").slice(0, 120);
		const author = islandAvatars.get(msg.discordUserId);
		const avatarUrl = author?.url || null;
		const name = author?.name || msg.discordUserId;

		api?.showToast?.(
			`${name}: ${text}`,
			api?.ContainerId?.INFO,
			{ position: "top-center" },
			avatarUrl,
		);

		playChatNotifySound();
	}

	const islandAvatars = new Map();

	function buildAvatarList() {
		const hostId = connection.hostId;
		return [...islandAvatars.entries()]
			.sort(([a], [b]) => {
				if (a === hostId) return -1;
				if (b === hostId) return 1;
				return a < b ? -1 : a > b ? 1 : 0;
			})
			.map(([id, avatar]) => ({
				id,
				url: avatar.url,
				name: avatar.name || id,
				isHost: !!hostId && id === hostId,
				isSelf: id === SELF_DISCORD_ID,
			}));
	}

	function upsertAvatar(discordUserId, avatarUrl, name) {
		const prev = islandAvatars.get(discordUserId);
		islandAvatars.set(discordUserId, {
			url: avatarUrl || prev?.url || null,
			name: name || prev?.name || null,
		});
		renderPanel();
	}

	function removeAvatar(discordUserId) {
		islandAvatars.delete(discordUserId);
		renderPanel();
	}

	function clearAvatars() {
		islandAvatars.clear();
	}

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
		if (
			_audioTiming &&
			Date.now() - _audioTiming.at < AUDIO_TIMING_STALE_MS
		) {
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
		const fromServerAdmin =
			msg.by === "server" || msg.by === "server-admin";

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
				connection.serverVersion =
					msg.version || connection.serverVersion;
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

	function handleStatus(next) {
		const wasConnected = connection.connected;

		connection = { ...connection, ...next };
		if (next.discordUserId) SELF_DISCORD_ID = next.discordUserId;

		if (connection.connected && !wasConnected) {
			deviatedFromHost = false;

			for (const peer of next.peers ?? []) {
				upsertAvatar(
					peer.discordUserId,
					peer.avatarUrl,
					peer.name || null,
				);
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
			if (
				isApplyingState ||
				isNavigating ||
				isNavSettling ||
				isSyncPaused
			)
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

	function fnv1a(str) {
		let h = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h =
				(h +
					((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>>
				0;
		}
		return h.toString(36);
	}

	function getShareableTrack() {
		const api = window.nextmusicApi;
		if (typeof api?.getCurrentTrack !== "function") return null;

		const track = api.getCurrentTrack();
		if (!track || !track.id) return null;

		const id = String(track.id);

		if (id.startsWith(UGC_PREFIX) || UUID_RE.test(id)) {
			const cached = ugcByTrackId.get(id);
			if (cached) return { trackId: id, ugc: cached };

			const url = api.getCurrentMp3Url?.();
			if (!url) return { trackId: id };

			const ugc = { u: url };
			if (track.title) ugc.t = track.title;
			if (track.artistNames?.[0]) ugc.a = track.artistNames[0];
			if (track.coverUrl) ugc.c = track.coverUrl;

			const trackId = id.startsWith(UGC_PREFIX)
				? id
				: UGC_PREFIX + fnv1a(url);
			ugcByTrackId.set(trackId, ugc);

			return { trackId, ugc };
		}

		return { trackId: id };
	}

	function getTrackId() {
		return getShareableTrack()?.trackId ?? null;
	}

	function getAlbumPath() {
		return getTrackId();
	}

	function forceSendCurrentTrack() {
		const p = getAlbumPath();
		if (!p || !isConnected()) return;

		lastSentPath = p;

		const message = { type: "navigate", trackId: p, roomId: ROOM_ID };
		const ugc = ugcByTrackId.get(p);
		if (p.startsWith(UGC_PREFIX) && ugc) message.ugc = ugc;

		const pos = getPosition();
		if (typeof pos === "number") message.position = pos;

		LA.send(message);
	}

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
