async () => {
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
};
