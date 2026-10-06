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
			if (!isHost() || !targetId || targetId === SELF_DISCORD_ID) return;
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
				position: window.nextmusicApi?.getState?.()?.progress?.position ?? 0,
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
		serverNowPlaying.ugc = ugcByTrackId.get(serverNowPlaying.id) ?? null;
	}
	return {
		dot: notConfigured ? "disconnected" : view.dot,
		color: notConfigured ? "#888" : view.color,
		text: notConfigured ? "Not connected" : view.text || serverDisplayName(),
		serverVersion: notConfigured ? null : connection.serverVersion,
		serverDescription: notConfigured ? null : connection.serverDescription,
		serverCover: notConfigured ? null : connection.serverCover,
		minClientVersion: notConfigured ? null : connection.minClientVersion,
		maxClientVersion: notConfigured ? null : connection.maxClientVersion,
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
