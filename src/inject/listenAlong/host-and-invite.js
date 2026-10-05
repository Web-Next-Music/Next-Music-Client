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
	return text.startsWith(INVITE_PREFIX) || text.startsWith(INVITE_URL_PREFIX);
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
