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

	const UGC_PREFIX = "ugc:";
	const UUID_RE =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	const scriptSrc = document.currentScript?.src || "";
	const fontBaseUrl = scriptSrc
		? new URL("../assets/fonts/", scriptSrc).href
		: "";
	const nunito600Url = `${fontBaseUrl}nunito/XRXI3I6Li01BKofiOc5wtlZ2di8HDGUmRTM.ttf`;
	const nunito700Url = `${fontBaseUrl}nunito/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmRTM.ttf`;

	const initial = await LA.getConfig();

	const blackIsland = initial?.blackIsland ?? false;
	const ROOM_ID = initial?.roomId || null;
	let CLIENT_ID = initial?.clientId || null;

	let connection = {
		connected: false,
		connecting: false,
		serverName: null,
		serverLabel: "",
		isHost: false,
		hostId: null,
		fatal: null,
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

	const ugcByTrackId = new Map();

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

		console.log("Initialization complete - lastSentPath:", lastSentPath);
	}

	const isBlackIsland = blackIsland === true || blackIsland === "true";

	let islandBg, islandBlur;

	if (isBlackIsland) {
		islandBg = `#000`;
		islandBlur = `0`;
	} else {
		islandBg = `#0005`;
		islandBlur = `30px`;
	}

	(function injectStyles() {
		if (document.getElementById("__li_styles__")) return;

		const s = document.createElement("style");
		s.id = "__li_styles__";
		s.textContent = `
        @font-face {
            font-family: "Nunito";
            font-style: normal;
            font-weight: 600;
            font-display: swap;
            src: url("${nunito600Url}") format("truetype");
        }

        @font-face {
            font-family: "Nunito";
            font-style: normal;
            font-weight: 700;
            font-display: swap;
            src: url("${nunito700Url}") format("truetype");
        }

        #__li_island__ {
            position: fixed;
            top: 20px;
            left: 50%;
            height: 34px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform-origin: center top;
            z-index: 9999;
            pointer-events: none;
            transform: translateX(-50%) translateY(-140%);
            opacity: 0;
            background: ${islandBg};
            backdrop-filter: blur(${islandBlur});
            border-radius: 1000px;
            border: solid 1px #fff3;
            -webkit-app-region: no-drag;
        }

        #__li_island__.island-visible {
            animation: liIslandSlideIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            pointer-events: auto;
        }

        #__li_island__.island-hiding {
            animation: liIslandSlideOut 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            pointer-events: none;
        }

        @keyframes liIslandSlideIn {
            0%   { transform: translateX(-50%) translateY(-130%) scale(0.9); opacity: 0; }
            100% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
        }

        @keyframes liIslandSlideOut {
            0%   { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
            100% { transform: translateX(-50%) translateY(-130%) scale(0.9); opacity: 0; }
        }

        #__li_inner__ {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 4px 6px 4px 12px;
            font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 14px;
            font-weight: 800;
            color: #fff;
            user-select: none;
            white-space: nowrap;
            cursor: default;
            overflow: hidden;
            transform-origin: center center;
            box-sizing: border-box;
            will-change: transform, opacity;
        }

        #__li_inner__.li-content-fade-out {
            opacity: 0;
            transform: translateY(4px) scale(0.98);
            transition: opacity 0.18s ease, transform 0.18s ease;
        }

        #__li_inner__.li-content-fade-in {
            opacity: 1;
            transform: translateY(0) scale(1);
            transition: opacity 0.22s ease, transform 0.22s ease;
        }

        #__li_island__.island-hiding #__li_inner__ {
            animation: liInnerShrink 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        #__li_island__.island-visible #__li_inner__ {
            animation: liInnerExpand 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) forwards;
        }

        @keyframes liInnerShrink {
            0%   { transform: scaleX(1); }
            100% { transform: scaleX(0.1); }
        }

        @keyframes liInnerExpand {
            0%   { transform: scaleX(0.1); }
            35%  { transform: scaleX(0.1); }
            100% { transform: scaleX(1); }
        }

        #__li_dot_wrap__ {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 6px;
            height: 6px;
        }

        #__li_dot__ {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            pointer-events: none;
            transition: background 0.55s cubic-bezier(0.4, 0, 0.2, 1),
                        opacity 0.4s ease;
        }

        #__li_dot_wrap__.disconnected { cursor: pointer; }
        #__li_dot_wrap__.connecting   { cursor: pointer; }
        #__li_dot_wrap__.connected    { cursor: pointer; }
        #__li_dot_wrap__.sync-paused  { cursor: pointer; }
        #__li_dot_wrap__.unavailable  { cursor: default; }

        #__li_dot_wrap__.disconnected #__li_dot__,
        #__li_dot_wrap__.unavailable #__li_dot__ {
            background: #555;
            opacity: 1;
        }

        #__li_dot_wrap__.connecting #__li_dot__ {
            background: #888;
            opacity: 1;
            animation: liPulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        #__li_dot_wrap__.connected #__li_dot__ {
            background: #1db954;
            opacity: 1;
            animation: liPulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        #__li_dot_wrap__.sync-paused #__li_dot__ {
            background: #f5a623;
            opacity: 1;
        }

        #__li_status__ {
            font-size: 12px;
            letter-spacing: 0.02em;
            white-space: nowrap;
            overflow: hidden;
            max-width: calc(100vw - 200px);
            /* max-width deliberately has no transition: animateInnerWidth
               measures the collapsed label right after .hidden is applied, and
               a transition here would hand it the old width and pin the island
               open. The pill's own width animation carries the motion. */
            transition:
                opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                color 0.4s ease;
        }

        #__li_status__.hidden {
            opacity: 0;
            max-width: 0;
            transform: translateY(3px);
        }

        #__li_avatars__ {
            display: flex;
            align-items: center;
            gap: 3px;
            transition:
                opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            max-width: 0;
            opacity: 0;
        }

        #__li_avatars__.visible {
            max-width: 400px;
            opacity: 1;
        }

        .li-av-wrap {
            position: relative;
            flex-shrink: 0;
            animation: liAvatarIn 0.35s both;
        }

        .li-av-wrap.removing {
            animation: liAvatarOut 0.2s forwards;
        }

        .li-av-img,
        .li-av-placeholder {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.18);
            object-fit: cover;
            display: block;
        }

        .li-av-placeholder {
            background: rgba(255,255,255,0.12);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 600;
            color: rgba(255,255,255,0.7);
        }

        .li-av-wrap.host .li-av-img,
        .li-av-wrap.host .li-av-placeholder {
            border-color: #1db954;
        }

        @keyframes liPulse {
            0%, 100% { opacity: 1; }
            50%      { opacity: 0.3; }
        }

        @keyframes liAvatarIn {
            from { transform: scale(0) rotate(-12deg); opacity: 0; }
            to   { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        @keyframes liAvatarOut {
            from { transform: scale(1); opacity: 1; max-width: 32px; }
            to   { transform: scale(0); opacity: 0; max-width: 0; }
        }
    `;

		document.head.appendChild(s);
	})();

	// Cached DOM refs, populated once buildIsland() runs
	let __li_island__ = null;
	let __li_inner__ = null;
	let __li_status__ = null;
	let __li_dot_wrap__ = null;
	let __li_avatars__ = null;

	// Build island DOM
	function buildIsland() {
		if (document.getElementById("__li_island__")) return;

		const island = document.createElement("div");
		island.id = "__li_island__";

		const inner = document.createElement("div");
		inner.id = "__li_inner__";

		const dotWrap = document.createElement("span");
		dotWrap.id = "__li_dot_wrap__";
		dotWrap.className = "disconnected";

		const dot = document.createElement("span");
		dot.id = "__li_dot__";

		const status = document.createElement("span");
		status.id = "__li_status__";

		const avatarRow = document.createElement("div");
		avatarRow.id = "__li_avatars__";

		dotWrap.appendChild(dot);
		inner.appendChild(dotWrap);
		inner.appendChild(status);
		inner.appendChild(avatarRow);
		island.appendChild(inner);
		document.body.appendChild(island);

		island.style.cursor = "pointer";
		island.title = "Click to copy an invite to this room";
		island.addEventListener("click", copyInvite);

		__li_island__ = island;
		__li_inner__ = inner;
		__li_status__ = status;
		__li_dot_wrap__ = dotWrap;
		__li_avatars__ = avatarRow;
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
			console.log("Listen Along invite:", code);
			toast("Invite is in the console");
		}
	}

	function toast(message) {
		const api = window.nextmusicApi;
		try {
			api?.showErrorToast?.(message, api?.ContainerId?.INFO);
		} catch {}
		console.log(`Listen Along: ${message}`);
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
			toast(`Joining ${res.roomId} on ${res.host}`);
		});
	}

	buildIsland();

	document.addEventListener("click", (e) => {
		const wrap = __li_dot_wrap__;
		if (!wrap || (!wrap.contains(e.target) && e.target !== wrap)) return;
		if (wrap.classList.contains("unavailable")) return;

		if (connection.connected || connection.connecting) {
			console.log("Listen Along: disconnecting by user");
			LA.disconnect();
		} else {
			console.log("Listen Along: reconnecting by user");
			LA.connect();
		}
	});

	// Island show / hide

	let _islandVisible = false;

	function showIsland() {
		const island = __li_island__;

		if (!island) return;
		if (_islandVisible && !island.classList.contains("island-hiding"))
			return;

		_islandVisible = true;
		island.classList.remove("island-hiding");
		void island.offsetWidth;
		island.classList.add("island-visible");
	}

	function hideIsland() {
		const island = __li_island__;

		if (!island || !_islandVisible) return;

		_islandVisible = false;
		island.classList.remove("island-visible");
		void island.offsetWidth;
		island.classList.add("island-hiding");
	}

	function animateInnerWidth(changeFn) {
		const inner = __li_inner__;

		if (!inner) {
			changeFn();
			return;
		}

		const fromW = inner.getBoundingClientRect().width;
		inner.style.width = fromW + "px";
		inner.style.transition = "none";

		changeFn();

		const avRow = __li_avatars__;
		if (avRow && avRow.classList.contains("visible")) {
			avRow.style.transition = "none";
			avRow.style.maxWidth = "none";
			avRow.style.opacity = "1";
		}

		inner.style.width = "";
		const toW = inner.getBoundingClientRect().width;
		inner.style.width = fromW + "px";
		void inner.offsetWidth;

		inner.style.transition = "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
		inner.style.width = toW + "px";

		inner.addEventListener("transitionend", function handler(e) {
			if (e.propertyName !== "width") return;

			inner.style.transition = "";
			inner.style.width = "";

			if (avRow) {
				avRow.style.transition = "";
				avRow.style.maxWidth = "";
				avRow.style.opacity = "";
			}

			inner.removeEventListener("transitionend", handler);
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
				text: `Connected to ${serverDisplayName()}`,
				color: "#1db954",
				collapse: true,
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

	const LABEL_COLLAPSE_MS = 2000;

	let _labelCollapseTimer = null;
	let _labelCollapsed = false;

	function resetCollapse() {
		clearTimeout(_labelCollapseTimer);
		_labelCollapseTimer = null;
		_labelCollapsed = false;
	}

	function expandLabel() {
		const wasCollapsed = _labelCollapsed;
		resetCollapse();
		if (!wasCollapsed) return;

		const status = __li_status__;
		if (status) animateInnerWidth(() => status.classList.remove("hidden"));
	}

	function scheduleLabelCollapse() {
		if (_labelCollapsed || _labelCollapseTimer) return;

		_labelCollapseTimer = setTimeout(() => {
			_labelCollapseTimer = null;

			const status = __li_status__;
			if (!status) return;

			_labelCollapsed = true;
			animateInnerWidth(() => status.classList.add("hidden"));
		}, LABEL_COLLAPSE_MS);
	}

	function renderIsland() {
		const wrap = __li_dot_wrap__;
		const status = __li_status__;
		const avRow = __li_avatars__;
		const view = islandState();

		if (view.hidden) {
			expandLabel();
			hideIsland();
			return;
		}

		if (wrap) {
			wrap.className = view.dot;
			wrap.title = connection.connected
				? "Click to disconnect"
				: "Click to connect";
		}

		if (avRow) {
			avRow.classList.toggle("visible", connection.connected);

			if (!connection.connected) {
				avRow.style.transition = "";
				avRow.style.maxWidth = "";
				avRow.style.opacity = "";
			}
		}

		if (status && status.textContent !== view.text) {
			resetCollapse();
			animateInnerWidth(() => {
				status.classList.remove("hidden");
				status.style.color = view.color;
				status.textContent = view.text;
			});
		} else {
			if (!view.collapse) expandLabel();
			if (status) status.style.color = view.color;
		}

		if (view.collapse) scheduleLabelCollapse();

		showIsland();
	}

	// Avatar map
	const islandAvatars = new Map();

	function sortAvatars() {
		const avRow = __li_avatars__;
		if (!avRow) return;

		const hostId = connection.hostId;
		const ordered = [...islandAvatars.entries()].sort(([a], [b]) => {
			if (a === hostId) return -1;
			if (b === hostId) return 1;
			return a < b ? -1 : a > b ? 1 : 0;
		});

		for (const [, wrap] of ordered) avRow.appendChild(wrap);
	}

	function applyHostBadge() {
		for (const [id, wrap] of islandAvatars) {
			wrap.classList.toggle(
				"host",
				!!connection.hostId && id === connection.hostId,
			);
		}

		sortAvatars();
	}

	function upsertAvatar(clientId, base64Data, mime) {
		const avRow = __li_avatars__;
		if (!avRow) return;

		animateInnerWidth(() => {
			let wrap = islandAvatars.get(clientId);
			if (!wrap) {
				wrap = document.createElement("div");
				wrap.className = "li-av-wrap";
				avRow.appendChild(wrap);
				islandAvatars.set(clientId, wrap);
			}

			const old = wrap.querySelector(".li-av-img, .li-av-placeholder");
			if (old) old.remove();

			if (base64Data) {
				const img = document.createElement("img");
				img.className = "li-av-img";
				img.src = `data:${mime || "image/webp"};base64,${base64Data}`;
				img.title = clientId;
				img.onerror = () => {
					img.replaceWith(makePlaceholder(clientId));
				};
				wrap.appendChild(img);
			} else {
				wrap.appendChild(makePlaceholder(clientId));
			}
		});

		applyHostBadge();
	}

	function makePlaceholder(clientId) {
		const el = document.createElement("div");
		el.className = "li-av-placeholder";
		el.textContent = (clientId?.[0] || "?").toUpperCase();
		el.title = clientId;
		return el;
	}

	function removeAvatar(clientId) {
		const wrap = islandAvatars.get(clientId);
		if (!wrap) return;
		wrap.classList.add("removing");
		setTimeout(() => {
			animateInnerWidth(() => {
				wrap.remove();
				islandAvatars.delete(clientId);
			});
		}, 230);
	}

	function clearAvatars() {
		for (const [, wrap] of islandAvatars) wrap.remove();
		islandAvatars.clear();
	}

	const AVATAR_SEL = 'img[class*="UserID-Avatar-Image"]';

	let lastSentAvatarUrl = null;
	let avatarWatchTimer = null;

	function currentAvatarUrl() {
		const img = document.querySelector(AVATAR_SEL);
		const src = img?.currentSrc || img?.src || "";
		if (!src) return null;

		try {
			return new URL(src, location.href).href;
		} catch {
			return null;
		}
	}

	function pushAvatar() {
		if (!isConnected()) return;

		const url = currentAvatarUrl();
		if (!url || url === lastSentAvatarUrl) return;

		lastSentAvatarUrl = url;
		LA.send({ type: "avatar_url", url });
		console.log("Listen Along: avatar sent");
	}

	function startAvatarWatch() {
		pushAvatar();
		if (avatarWatchTimer) return;
		avatarWatchTimer = setInterval(pushAvatar, 5000);
	}

	function stopAvatarWatch() {
		clearInterval(avatarWatchTimer);
		avatarWatchTimer = null;
		lastSentAvatarUrl = null;
	}

	// Play/Pause helpers
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

	function getPosition() {
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

		console.log(`⏱️ Seek → ${seconds.toFixed(1)}s`);
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
			isSeekingTimeline ||
			deviatedFromHost ||
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
		} else if (force && targetPath && targetPath === currentPath) {
			if (!isApplyingState) {
				applyPlayState(targetPlaying);
			}
		}

		if (!needNav && !isNavigating && !isApplyingState) {
			applyPlayState(targetPlaying);
		}

		syncTarget = {
			trackId: targetPath,
			position: targetPosition,
			stamp: targetServerTime || Date.now(),
			playing: !!targetPlaying,
		};

		if (!isSeekingTimeline && !isNavigating) {
			const current = getPosition();
			const targetPos = hostPositionNow();

			if (current !== null && targetPos !== null) {
				const diff = Math.abs(current - targetPos);

				if (forceSeek || diff > HARD_SEEK_SEC) {
					console.log(
						`Sync: diff=${diff.toFixed(1)}s → ${targetPos.toFixed(1)}s`,
					);

					hardSeekTo(targetPos);
				}
			}
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
		const fromServer =
			msg.by === "server" || msg.by === "server-admin" || !msg.by;

		if (fromHost || fromServer) {
			deviatedFromHost = false;
		} else if (deviatedFromHost) {
			return;
		}

		if (isSyncPaused) {
			console.log("⏸️ Sync paused - playback not applied");
			return;
		}

		applySyncState(msg, fromHost, false);
	}

	function handleMessage(msg) {
		if (!msg || typeof msg.type !== "string") return;

		switch (msg.type) {
			case "server_info":
				connection.serverName = msg.name || connection.serverName;
				connection.hostId = msg.hostId || null;
				applyHostBadge();
				renderIsland();
				break;

			case "auth_result":
				if (!msg.ok) {
					console.warn("Listen Along: host token rejected");
				} else if (msg.isHost) {
					console.log("Listen Along: you are the host of this room");
				}
				break;

			case "host_changed":
				connection.hostId = msg.hostId || null;
				applyHostBadge();
				renderIsland();
				break;

			case "state_sync":
				handleStateSync(msg);
				break;

			case "client_joined":
				upsertAvatar(msg.clientId, msg.avatar || null, msg.mime);
				break;

			case "client_left":
				removeAvatar(msg.clientId);
				break;

			case "avatar":
				upsertAvatar(msg.clientId, msg.data, msg.mime);
				break;

			case "error":
				console.warn(`❌ Server error [${msg.code}]:`, msg.message);
				break;
		}
	}

	function handleStatus(next) {
		const wasConnected = connection.connected;

		connection = { ...connection, ...next };
		if (next.clientId) CLIENT_ID = next.clientId;

		if (connection.connected && !wasConnected) {
			console.log(`Listen Along: connected to room [${ROOM_ID}]`);
			deviatedFromHost = false;

			for (const peer of next.peers ?? []) {
				upsertAvatar(peer.clientId, peer.avatar, peer.mime);
			}

			if (CLIENT_ID && !islandAvatars.has(CLIENT_ID)) {
				upsertAvatar(CLIENT_ID, null);
			}

			startObserver();
			startPlayStateObserver();
			startTimelineObserver();
			startDriftControl();
			startAvatarWatch();

			clearTimeout(initTimeout);
			initTimeout = setTimeout(liftInitializing, 5000);
		}

		if (!connection.connected && wasConnected) {
			clearTimeout(initTimeout);
			isInitializing = true;
			serverState = null;
			syncTarget = null;
			resetRate();
			stopAvatarWatch();
			clearAvatars();
		}

		applyHostBadge();
		renderIsland();
	}

	LA.onMessage(handleMessage);
	LA.onStatus(handleStatus);

	startInviteWatch();

	handleStatus(initial ?? {});

	// Navigation
	function processNext() {
		if (!pendingPath) return;
		const p = pendingPath;
		pendingPath = null;
		navigateAndPlay(p);
	}

	function navigateAndPlay(p) {
		if (_navigatingToPath === p) {
			console.log(
				`⏭️ Already navigating to trackId "${p}", skip duplicate`,
			);
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
			console.log(`Already on trackId "${p}", skip navigation`);
			_suppressSend = p;
			lastSentPath = p;
			if (serverState) {
				setTimeout(() => applySyncState(serverState, true), 200);
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
			console.log("▶️ playCustomTrack:", p, ugc.t || "");

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
			console.log("▶️ playTrackById:", p);

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
		if (_pendingSyncAfterNav && serverState) {
			_pendingSyncAfterNav = false;
			console.log("Applying deferred server state after navigation");
			setTimeout(() => applySyncState(serverState, true), 300);
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
				console.log(
					`✔ Track "${expectedId}" is now active (playing=${isPlaying})`,
				);
				setTimeout(() => finishNavigation(), 400);
				return;
			}

			if (++attempts >= 40) {
				clearInterval(wait);
				console.warn(
					`⚠️ Timed out waiting for trackId "${expectedId}" (got "${currentId}")`,
				);
				finishNavigation();
			}
		}, 500);
	}

	function markDeviated(what) {
		if (isHost() || deviatedFromHost) return;
		deviatedFromHost = true;
		console.log(`Listening independently after a local ${what} change`);
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

		console.log("playstate →server (instant):", playing);
	}

	function applyPlayState(wantPlay) {
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

	let playStateTimer = null;

	function startPlayStateObserver() {
		if (_playStateObserverStarted) return;
		_playStateObserverStarted = true;

		let lastPlaying = null;

		function check() {
			if (isApplyingState || isNavigating || isSyncPaused) return;
			if (!getAlbumPath()) return;
			const playing = isPlayingNow();
			if (playing === null || playing === lastPlaying) return;
			lastPlaying = playing;
			sendPlayState(playing);
		}

		window.nextmusicApi?.onStatusChange?.(() => check());

		playStateTimer = setInterval(check, 1000);
	}

	// Timeline sync
	let timelinePollTimer = null;

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
				console.log("seek →server (instant):", val);
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

	// Track ID helpers (via nextmusicApi)

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

		if (id.startsWith(UGC_PREFIX)) {
			const ugc = ugcByTrackId.get(id);
			return ugc ? { trackId: id, ugc } : { trackId: id };
		}

		if (!UUID_RE.test(id)) return { trackId: id };

		const url = api.getCurrentMp3Url?.();
		if (!url) return null;

		const ugc = { u: url };
		if (track.title) ugc.t = track.title;
		if (track.artistNames?.[0]) ugc.a = track.artistNames[0];
		if (track.coverUrl) ugc.c = track.coverUrl;

		const trackId = UGC_PREFIX + fnv1a(url);
		ugcByTrackId.set(trackId, ugc);

		return { trackId, ugc };
	}

	function getTrackId() {
		return getShareableTrack()?.trackId ?? null;
	}

	function getAlbumPath() {
		return getTrackId();
	}

	// Send debounce
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

			LA.send(message);
			console.log("navigate →server (debounced) trackId:", p);
		}, SEND_DELAY_MS);
	}

	function trySend(p) {
		if (!p || isInitializing || isNavigating || isSyncPaused) return;
		if (p === _suppressSend) {
			_suppressSend = null;
			lastSentPath = p;
			return;
		}
		const serverPath = serverState?.trackId ?? null;
		if (p === lastSentPath) return;
		if (p === serverPath) {
			lastSentPath = p;
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
		console.log("▶️ Track available - sync resumed");

		renderIsland();

		if (serverState) {
			const currentId = getTrackId();
			const srvId = serverState.trackId;
			const needsNav = srvId && srvId !== currentId;

			if (needsNav) {
				_pendingSyncAfterNav = true;
			}

			applySyncState(serverState, true);
		}
	}

	function pauseSyncNoTrack(reason) {
		if (isSyncPaused) return;
		isSyncPaused = true;
		_pendingSyncAfterNav = false;
		renderIsland();
		console.log(`⏸️ ${reason} - sync paused`);
	}

	let trackObserverTimer = null;

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
				lastPolledPath = p;
				return;
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
	}

	function stopListenAlong() {
		if (avatarWatchTimer) {
			clearInterval(avatarWatchTimer);
			avatarWatchTimer = null;
		}
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
	}

	window.stopListenAlong = stopListenAlong;
})();
