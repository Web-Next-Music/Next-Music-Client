(async () => {
    const SEL = {
        // Нижняя панель плеера
        playerBar: '[class*="PlayerBar_root"]',
        // Ссылка на альбом/трек в нижней панели (используется как ID текущего трека)
        albumLink: '[class*="Meta_albumLink"]',
        // Иконка кнопки play/pause в нижней панели
        playButtonIcon: '[class*="BaseSonataControlsDesktop_playButtonIcon__"]',
        // Основной слайдер времени в нижней панели
        timeSlider:
            '[class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]',
        // Слайдер времени в полноэкранном режиме
        fullscreenSlider:
            'input[class*="FullscreenPlayerDesktopContent_slider"]',
        // Строка синхронизированного текста (клик = перемотка)
        lyricsLine: '[class*="SyncLyricsLine_root"]',
        // Модалка трека
        trackModal: '[class*="TrackModal_modalContent"]',
        // Кнопка play в модалке трека
        trackModalPlayBtn:
            '[class*="TrackModal_modalContent"] * [class*="TrackModalControls_controlsContainer"] > button',
        // Элементы, клик/drag по которым считается перемоткой и отправляется seek
        seekSources: [
            '[class*="PlayerBarDesktopWithBackgroundProgressBar_slider"]',
            'input[class*="FullscreenPlayerDesktopContent_slider"]',
            '[class*="SyncLyricsLine_root"]',
        ],
        // Дополнительные элементы управления, взаимодействие с которыми
        // сигнализирует об активности пользователя (play/pause/next/prev и т.п.)
        actionSources: [
            '[class*="BaseSonataControlsDesktop_sonataButton"]',
            '[class*="SonataFullscreenControlsDesktop_sonataButton"]',
        ],
    };

    const _qs = new URLSearchParams(location.search);

    const blackIsland = _qs.get("__blackIsland") || null;

    const _wssHost = _qs.get("__wss") || null;
    const WSS_HOST = _wssHost ? "wss://" + _wssHost : null;
    const ROOM_ID = _qs.get("__room") || null;
    const CLIENT_ID = _qs.get("__clientId") || null;
    const AVATAR_URL = _qs.get("__avatarUrl") || null;
    const SYNC_THRESHOLD_SEC = 1;

    let wss = null;
    let serverName = null;
    let _currentServerLabel = "";
    let observerStarted = false;
    let lastSentPath = null;
    let isNavigating = false;
    // Путь, к которому сейчас идёт навигация — для дедупликации
    let _navigatingToPath = null;
    let pendingPath = null;
    let _pendingSyncAfterNav = false;
    let isApplyingState = false;
    let lastSentPlayHref = null;
    let isSeekingTimeline = false;
    let isInitializing = true;
    let initTimeout = null;
    let serverState = null;
    let isSyncPaused = false;
    let _userPausedSync = false;
    let _suppressSend = null;
    let _suppressSeekSend = false;

    function liftInitializing() {
        if (!isInitializing) return;
        isInitializing = false;
        const href = getPlayIconHref();
        if (href) lastSentPlayHref = href;
        if (serverState && serverState.path) {
            lastSentPath = serverState.path;
        } else {
            const p = getAlbumPath();
            if (p) lastSentPath = p;
        }
        console.log("✅ Initialization complete — lastSentPath:", lastSentPath);
    }

    const XLINK = "http://www.w3.org/1999/xlink";

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
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&display=swap');

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

        #__li_dot_wrap__.disconnected { }
        #__li_dot_wrap__.connected    { cursor: pointer; }
        #__li_dot_wrap__.sync-paused  { cursor: pointer; }

        #__li_dot_wrap__.disconnected #__li_dot__ {
            background: #555;
            opacity: 1;
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
            transition:
                opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1),
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

        .li-av-wrap.active-sender .li-av-img,
        .li-av-wrap.active-sender .li-av-placeholder {
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

    // ─── Build island DOM ───────────────────────────────────────────────

    function buildIsland() {
        if (document.getElementById("__li_island__")) return;

        const island = document.createElement("div");
        island.id = "__li_island__";

        const inner = document.createElement("div");
        inner.id = "__li_inner__";

        const dotWrap = document.createElement("span");
        dotWrap.id = "__li_dot_wrap__";
        dotWrap.className = "disconnected";
        dotWrap.title = "Disconnected";

        const dot = document.createElement("span");
        dot.id = "__li_dot__";

        const status = document.createElement("span");
        status.id = "__li_status__";
        status.className = "hidden";

        const avatarRow = document.createElement("div");
        avatarRow.id = "__li_avatars__";

        dotWrap.appendChild(dot);
        inner.appendChild(dotWrap);
        inner.appendChild(status);
        inner.appendChild(avatarRow);
        island.appendChild(inner);
        document.body.appendChild(island);
    }

    buildIsland();

    // ─── Dot state helper ───────────────────────────────────────────────

    function setDotState(state, titleText) {
        const wrap = document.getElementById("__li_dot_wrap__");
        if (!wrap) return;
        wrap.className = state;
        wrap.title = titleText || "";
    }

    document.addEventListener("click", (e) => {
        const wrap = document.getElementById("__li_dot_wrap__");
        if (!wrap || (!wrap.contains(e.target) && e.target !== wrap)) return;

        if (wrap.classList.contains("sync-paused")) {
            resumeSync();
        } else if (wrap.classList.contains("connected")) {
            pauseSyncByUser();
        }
    });

    function pauseSyncByUser() {
        isSyncPaused = true;
        _userPausedSync = true;
        _pendingSyncAfterNav = false;
        console.log("⏸️ Sync manually paused by user");
        setDotState("sync-paused", "Synchronize");
        clearTimeout(statusHideTimer);
        animateInnerWidth(() => {
            const status = document.getElementById("__li_status__");
            if (status) status.classList.add("hidden");
        });
    }

    function resumeSync() {
        if (!isSyncPaused) return;
        isSyncPaused = false;
        _userPausedSync = false;
        console.log("▶️ Sync resumed by user click on dot");
        setDotState("connected", _currentServerLabel);
        clearTimeout(statusHideTimer);
        animateInnerWidth(() => {
            const status = document.getElementById("__li_status__");
            if (status) status.classList.add("hidden");
            const avRow = document.getElementById("__li_avatars__");
            if (avRow) avRow.className = "visible";
        });
        if (serverState) {
            const currentPath = getAlbumPath();
            const needsNav =
                serverState.path && serverState.path !== currentPath;
            if (needsNav) {
                _pendingSyncAfterNav = true;
            }
            applySyncState(serverState, true);
        }
    }

    // ─── Island show / hide ─────────────────────────────────────────────

    let hideIslandTimer = null;
    let _islandVisible = false;

    function showIsland() {
        clearTimeout(hideIslandTimer);
        const island = document.getElementById("__li_island__");
        if (!island) return;
        if (_islandVisible && !island.classList.contains("island-hiding"))
            return;
        _islandVisible = true;
        island.classList.remove("island-hiding");
        void island.offsetWidth;
        island.classList.add("island-visible");
    }

    function hideIsland() {
        const island = document.getElementById("__li_island__");
        if (!island) return;
        _islandVisible = false;
        island.classList.remove("island-visible");
        void island.offsetWidth;
        island.classList.add("island-hiding");
    }

    function hideIslandAfter(ms) {
        clearTimeout(hideIslandTimer);
        hideIslandTimer = setTimeout(hideIsland, ms);
    }

    function animateInnerWidth(changeFn) {
        const inner = document.getElementById("__li_inner__");
        if (!inner) {
            changeFn();
            return;
        }

        const fromW = inner.getBoundingClientRect().width;
        inner.style.width = fromW + "px";
        inner.style.transition = "none";

        changeFn();

        const avRow = document.getElementById("__li_avatars__");
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

    // ─── Island state machine ───────────────────────────────────────────

    let statusHideTimer = null;

    function islandSetDisconnected(autoHide = true) {
        clearTimeout(statusHideTimer);
        const status = document.getElementById("__li_status__");
        const avRow = document.getElementById("__li_avatars__");

        setDotState("disconnected", "Disconnected");

        if (status) {
            status.classList.remove("hidden");
            status.style.color = "#888";
            status.textContent = "Disconnected";
        }

        if (avRow) avRow.className = "";

        showIsland();
        if (autoHide) hideIslandAfter(4000);
    }

    function islandSetConnected(serverHost) {
        clearTimeout(statusHideTimer);
        showIsland();
        _currentServerLabel = serverHost || "";
        setDotState("connected", _currentServerLabel);

        const status = document.getElementById("__li_status__");

        if (status) {
            status.style.opacity = "0";
            status.style.transform = "translateY(4px)";
            status.classList.remove("hidden");
            void status.offsetWidth;
            setTimeout(() => {
                status.style.color = "#1db954";
                status.textContent = `Connected to ${serverHost}`;
                status.style.opacity = "";
                status.style.transform = "";
            }, 250);
        }

        statusHideTimer = setTimeout(() => {
            animateInnerWidth(() => {
                if (status) status.classList.add("hidden");
                const avRow = document.getElementById("__li_avatars__");
                if (avRow) avRow.className = "visible";
            });
        }, 3000);
    }

    function islandSetSyncPaused() {
        clearTimeout(statusHideTimer);
        setDotState("sync-paused", "Synchronize");

        animateInnerWidth(() => {
            const status = document.getElementById("__li_status__");
            if (status) status.classList.add("hidden");
        });

        showIsland();
    }

    // ─── Avatar map ─────────────────────────────────────────────────────

    const islandAvatars = new Map();
    function setActiveSender(clientId) {
        for (const [, wrap] of islandAvatars)
            wrap.classList.remove("active-sender");
        const wrap = islandAvatars.get(clientId);
        if (wrap) wrap.classList.add("active-sender");
    }

    function upsertAvatar(clientId, base64Data) {
        const avRow = document.getElementById("__li_avatars__");
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
                img.src = `data:image/webp;base64,${base64Data}`;
                img.title = clientId;
                img.onerror = () => {
                    img.replaceWith(makePlaceholder(clientId));
                };
                wrap.appendChild(img);
            } else {
                wrap.appendChild(makePlaceholder(clientId));
            }
        });
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

    // ─── Send avatar from URL ────────────────────────────────────────────

    function sendAvatarFromUrl() {
        if (!AVATAR_URL) return;
        if (wss && wss.readyState === WebSocket.OPEN) {
            wss.send(
                JSON.stringify({
                    type: "avatar_url",
                    url: AVATAR_URL,
                    roomId: ROOM_ID,
                }),
            );
            console.log(`📤 Sending avatar URL to server: ${AVATAR_URL}`);
        }
    }

    // ─── Play/Pause helpers ─────────────────────────────────────────────

    function getPlayIconEl() {
        return document.querySelector(SEL.playButtonIcon);
    }
    function getPlayIconHref() {
        const el = getPlayIconEl();
        if (!el) return null;
        const use = el.querySelector("svg use");
        if (!use) return null;
        return (
            use.getAttributeNS(XLINK, "href") ||
            use.getAttribute("href") ||
            null
        );
    }
    function clickPlayIcon() {
        const el = getPlayIconEl();
        if (!el) {
            console.warn("⚠️ Play icon not found");
            return;
        }
        const btn = el.closest("button") || el;
        btn.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
        btn.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
        );
        btn.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
        console.log("🖱️ Click play/pause");
    }

    // ─── Timeline helpers ───────────────────────────────────────────────

    function getSlider() {
        return document.querySelector(SEL.timeSlider);
    }

    let _isSyntheticSeek = false;

    function seekTo(value) {
        const slider = getSlider();
        if (!slider) return;
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        ).set;
        setter.call(slider, value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        _isSyntheticSeek = true;
        slider.dispatchEvent(
            new PointerEvent("pointerup", { bubbles: true, cancelable: true }),
        );
        slider.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
        );
        _isSyntheticSeek = false;
        slider.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`⏱️ Seek → ${value}/${slider.max}`);
    }

    // ─── Apply state from server ────────────────────────────────────────

    function applySyncState(msg, force = false) {
        // Снимаем snapshot, чтобы гонки с новыми state_sync не влияли
        // на уже начавшуюся навигацию
        const targetPath = msg.path;
        const targetPlaying = msg.playing;
        const targetPosition = msg.position;
        const targetServerTime = msg.serverTime;

        // 1. Навигация к нужному треку
        const currentPath = getAlbumPath();
        const needNav =
            targetPath &&
            targetPath !== currentPath &&
            (force || targetPath !== lastSentPath) &&
            !isNavigating;

        if (needNav) {
            // Дополнительная проверка: убеждаемся что serverState на момент
            // запуска навигации всё ещё указывает на тот же path.
            // Это защита от устаревших state_sync-ов в очереди.
            if (serverState && serverState.path !== targetPath) {
                console.warn(
                    `🚫 Nav cancelled: msg.path="${targetPath}" != serverState.path="${serverState.path}"`,
                );
                // Применяем актуальный serverState вместо устаревшего
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

        // 2. Play / Pause
        if (!needNav && !isNavigating && !isApplyingState) {
            applyPlayState(targetPlaying);
        }

        // 3. Позиция
        if (!isSeekingTimeline && !isNavigating) {
            const slider = getSlider();
            if (slider) {
                const networkDelay =
                    (Date.now() - (targetServerTime || Date.now())) / 1000;
                const targetPos = targetPlaying
                    ? targetPosition + networkDelay
                    : targetPosition;
                const diff = Math.abs(parseInt(slider.value) - targetPos);
                if (force || diff > SYNC_THRESHOLD_SEC) {
                    console.log(
                        `🔄 Sync: diff=${diff.toFixed(1)}s → ${targetPos.toFixed(1)}s`,
                    );
                    isSeekingTimeline = true;
                    _suppressSeekSend = true;
                    seekTo(Math.round(targetPos));
                    setTimeout(() => {
                        isSeekingTimeline = false;
                    }, 1000);
                }
            }
        }
    }

    // ─── WebSocket ──────────────────────────────────────────────────────

    function connect() {
        if (!WSS_HOST || !ROOM_ID) {
            const status = document.getElementById("__li_status__");
            setDotState("disconnected", "Disconnected");
            if (status) {
                status.classList.remove("hidden");
                status.style.color = "#e05c5c";
                status.textContent = !WSS_HOST
                    ? "No server configured"
                    : "No room configured";
            }
            showIsland();
            console.warn(
                "Listen Along: missing __wss or __room param — not connecting.",
            );
            return;
        }
        const serverHost = WSS_HOST.replace(/^wss?:\/\//, "").split("/")[0];
        const url = `${WSS_HOST}?room=${encodeURIComponent(ROOM_ID)}&clientId=${encodeURIComponent(CLIENT_ID || "user_" + Math.random().toString(36).slice(2, 7))}`;
        wss = new WebSocket(url);

        wss.onopen = () => {
            console.log(`🔌 Connected to room [${ROOM_ID}] as [${CLIENT_ID}]`);
            islandSetConnected(serverName || serverHost);

            if (!islandAvatars.has(CLIENT_ID)) upsertAvatar(CLIENT_ID, null);

            startObserver();
            startPlayStateObserver();
            startTimelineObserver();
            sendAvatarFromUrl();

            clearTimeout(initTimeout);
            initTimeout = setTimeout(liftInitializing, 5000);
        };

        wss.onmessage = (event) => {
            const raw = event.data;
            if (typeof raw !== "string") return;
            let msg;
            try {
                msg = JSON.parse(raw.trim());
            } catch {
                msg = { type: "navigate", path: raw.trim() };
            }

            if (msg.type === "server_info") {
                if (msg.name) {
                    serverName = msg.name;
                    islandSetConnected(serverName);
                }
                return;
            }

            if (msg.type === "state_sync") {
                serverState = msg;

                if (
                    msg.by &&
                    msg.by !== CLIENT_ID &&
                    msg.by !== "heartbeat" &&
                    msg.by !== "server" &&
                    msg.by !== "server-admin"
                ) {
                    setActiveSender(msg.by);
                }

                if (isInitializing) {
                    clearTimeout(initTimeout);
                    initTimeout = setTimeout(liftInitializing, 1500);
                }

                if (!isSyncPaused) {
                    applySyncState(msg);
                } else {
                    console.log("⏸️ Sync paused — playback not applied");
                }

                return;
            }

            if (msg.type === "client_joined") {
                upsertAvatar(msg.clientId, msg.avatar || null);
            } else if (msg.type === "client_left") {
                removeAvatar(msg.clientId);
            } else if (msg.type === "avatar") {
                upsertAvatar(msg.clientId, msg.data);
            } else if (msg.type === "error") {
                console.warn("❌ Server error:", msg.message);
            }
        };

        wss.onerror = () => {};
        wss.onclose = (e) => {
            islandSetDisconnected();
            clearTimeout(initTimeout);
            isInitializing = true;
            serverState = null;
            if (e.code === 4001) {
                console.error(`🚫 Room [${ROOM_ID}] not found on server`);
                return;
            }
            console.warn("🔌 WS disconnected, reconnecting in 3s...");
            setTimeout(connect, 3000);
        };
    }

    if (!WSS_HOST) {
        islandSetDisconnected(false);
        console.warn(
            "Listen Along: no server configured (__wss param missing)",
        );
        return;
    }

    connect();

    // ─── Navigation ─────────────────────────────────────────────────────

    function processNext() {
        if (!pendingPath) return;
        const p = pendingPath;
        pendingPath = null;
        navigateAndPlay(p);
    }

    function navigateAndPlay(p) {
        // ── ПРОВЕРКА 1: не дублировать навигацию к тому же пути ──────────
        if (_navigatingToPath === p) {
            console.log(`⏭️ Already navigating to "${p}", skip duplicate`);
            return;
        }

        // ── ПРОВЕРКА 2: актуальность — сервер всё ещё хочет этот трек ───
        // serverState мог обновиться пока мы ждали дебаунс/processNext.
        // Если сервер уже переключился на другой трек — не идём на старый.
        if (serverState && serverState.path && serverState.path !== p) {
            console.warn(
                `🚫 Nav to "${p}" aborted — server now wants "${serverState.path}"`,
            );
            // Запускаем навигацию к актуальному пути
            pendingPath = serverState.path;
            processNext();
            return;
        }

        // ── ПРОВЕРКА 3: вдруг мы уже на нужном треке ────────────────────
        const currentPath = getAlbumPath();
        if (currentPath === p) {
            console.log(`✅ Already on "${p}", skip navigation`);
            _suppressSend = p;
            lastSentPath = p;
            // Просто применяем play/seek если нужно
            if (serverState) {
                setTimeout(() => applySyncState(serverState, true), 200);
            }
            return;
        }

        _navigatingToPath = p;
        isNavigating = true;
        console.log("🔗 Navigate:", p);
        if (window.location.pathname !== p) window.next.router.push(p);
        waitForTrackAndPlay(p);
    }

    function finishNavigation() {
        _navigatingToPath = null;
        isNavigating = false;
        processNext();
        if (_pendingSyncAfterNav && serverState) {
            _pendingSyncAfterNav = false;
            console.log("🔄 Applying deferred server state after navigation");
            setTimeout(() => applySyncState(serverState, true), 300);
        }
    }

    function waitForTrackAndPlay(expectedPath) {
        let attempts = 0;
        const wait = setInterval(() => {
            // ── ПРОВЕРКА A: пришёл новый pendingPath — прерываем текущий wait ──
            if (pendingPath && pendingPath !== expectedPath) {
                clearInterval(wait);
                console.warn(
                    `🔀 Nav interrupted: new path "${pendingPath}" overrides "${expectedPath}"`,
                );
                isNavigating = false;
                _navigatingToPath = null;
                processNext();
                return;
            }

            // ── ПРОВЕРКА B: serverState изменился пока мы ждали ────────────
            // Если сервер переключился на другой трек — прерываем и идём туда
            if (
                serverState &&
                serverState.path &&
                serverState.path !== expectedPath
            ) {
                clearInterval(wait);
                console.warn(
                    `🚫 waitForTrackAndPlay: server switched to "${serverState.path}" while waiting for "${expectedPath}"`,
                );
                isNavigating = false;
                _navigatingToPath = null;
                pendingPath = serverState.path;
                processNext();
                return;
            }

            const urlMatch = window.location.pathname === expectedPath;
            const playerBarPath = getAlbumPath();
            const currentHref = getPlayIconHref() || "";

            const alreadyPlayingRight =
                playerBarPath === expectedPath &&
                (currentHref.includes("pause") ||
                    currentHref.includes("Pause"));

            if (alreadyPlayingRight) {
                clearInterval(wait);
                console.log("▶️ Already playing right track:", expectedPath);
                setTimeout(() => {
                    finishNavigation();
                }, 500);
                return;
            }

            const btn = document.querySelector(SEL.trackModalPlayBtn);
            if (urlMatch && btn) {
                clearInterval(wait);
                setTimeout(() => {
                    // ── ПРОВЕРКА C: финальная проверка перед кликом ──────────
                    // serverState мог измениться пока мы ждали 300мс до клика
                    if (
                        serverState &&
                        serverState.path &&
                        serverState.path !== expectedPath
                    ) {
                        console.warn(
                            `🚫 Pre-click check failed: server now wants "${serverState.path}", not "${expectedPath}"`,
                        );
                        isNavigating = false;
                        _navigatingToPath = null;
                        pendingPath = serverState.path;
                        processNext();
                        return;
                    }

                    const href = getPlayIconHref() || "";
                    const pbPath = getAlbumPath();
                    const playing =
                        href.includes("pause") || href.includes("Pause");

                    if (playing && pbPath === expectedPath) {
                        console.log("▶️ Track already playing:", expectedPath);
                    } else {
                        btn.click();
                        console.log("▶️ Track started:", expectedPath);
                    }

                    setTimeout(() => {
                        // ── ПРОВЕРКА D: после клика — убеждаемся что путь совпал ──
                        const finalPath = getAlbumPath();
                        if (finalPath && finalPath !== expectedPath) {
                            console.warn(
                                `⚠️ Post-click path mismatch: got "${finalPath}", expected "${expectedPath}"`,
                            );
                            // Не паникуем — finishNavigation запустит processNext
                            // который подхватит serverState.path если он есть
                        }
                        finishNavigation();
                    }, 1000);
                }, 300);
                return;
            }

            if (++attempts >= 40) {
                clearInterval(wait);
                console.warn(
                    `⚠️ Timed out waiting for track "${expectedPath}"`,
                );
                finishNavigation();
            }
        }, 500);
    }

    // ─── Play/Pause sync ────────────────────────────────────────────────

    function sendPlayState(href) {
        if (!wss || wss.readyState !== WebSocket.OPEN) return;
        if (isInitializing || isSyncPaused || isSeekingTimeline) return;
        if (!getAlbumPath()) return;
        if (href === lastSentPlayHref) return;
        lastSentPlayHref = href;
        wss.send(JSON.stringify({ type: "playstate", href, roomId: ROOM_ID }));
        setActiveSender(CLIENT_ID);
        console.log("📤 playstate →server (instant):", href);
    }

    function applyPlayState(wantPlay) {
        const myHref = getPlayIconHref();
        if (!myHref) return;
        const currentlyPlaying =
            myHref.includes("pause") || myHref.includes("Pause");
        if (currentlyPlaying === wantPlay) return;
        isApplyingState = true;
        lastSentPlayHref = myHref;
        clickPlayIcon();
        setTimeout(() => {
            const newHref = getPlayIconHref();
            if (newHref) lastSentPlayHref = newHref;
            isApplyingState = false;
        }, 800);
    }

    let _playStateObserverStarted = false;
    function startPlayStateObserver() {
        if (_playStateObserverStarted) return;
        _playStateObserverStarted = true;
        let lastHref = null;
        function check() {
            if (isApplyingState || isNavigating || isSyncPaused) return;
            if (!getAlbumPath()) return;
            const href = getPlayIconHref();
            if (!href || href === lastHref) return;
            lastHref = href;
            sendPlayState(href);
        }

        setInterval(check, 1000);

        document.addEventListener(
            "pointerup",
            (e) => {
                if (isSyncPaused) return;
                const isAction = SEL.actionSources.some(
                    (sel) => e.target.closest?.(sel) || e.target.matches?.(sel),
                );
                if (!isAction) return;
                isApplyingState = false;
                setTimeout(check, 150);
                setTimeout(check, 500);
            },
            true,
        );

        function attachObserver() {
            const target =
                document.querySelector(SEL.playerBar) || document.body;
            new MutationObserver(check).observe(target, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["href", "xlink:href"],
            });
        }

        if (document.querySelector(SEL.playerBar)) {
            attachObserver();
        } else {
            const waitObs = new MutationObserver(() => {
                if (document.querySelector(SEL.playerBar)) {
                    waitObs.disconnect();
                    attachObserver();
                }
            });
            waitObs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ─── Timeline sync ──────────────────────────────────────────────────

    let _timelineObserverStarted = false;
    function startTimelineObserver() {
        if (_timelineObserverStarted) return;
        _timelineObserverStarted = true;

        let _sliderDownAt = 0;
        let _lyricsSeekPos = null;

        function isSeekSource(el) {
            if (!el) return false;
            return SEL.seekSources.some(
                (sel) => el.closest?.(sel) || el.matches?.(sel),
            );
        }

        function onSliderDown(e) {
            if (!isSeekSource(e.target)) return;
            _sliderDownAt = Date.now();
            _lyricsSeekPos = null;

            const lyricLine = e.target.closest?.(SEL.lyricsLine);
            if (lyricLine) {
                const t = parseFloat(
                    lyricLine.dataset.startTime ??
                        lyricLine.dataset.time ??
                        lyricLine.getAttribute("data-start-time") ??
                        lyricLine.getAttribute("data-time") ??
                        "",
                );
                if (!isNaN(t)) _lyricsSeekPos = t;
            }
        }

        function onSeekEnd(e) {
            if (_isSyntheticSeek) return;

            if (isInitializing || isNavigating || isSyncPaused) return;
            if (!isSeekSource(e.target)) return;

            if (_suppressSeekSend) {
                _suppressSeekSend = false;
                isSeekingTimeline = false;
                return;
            }

            isSeekingTimeline = false;

            const timeSinceDown = Date.now() - _sliderDownAt;
            if (timeSinceDown > 500) {
                console.log(
                    `⏭️ seek ignored — no recent click (${timeSinceDown}ms ago)`,
                );
                return;
            }

            let val;
            if (_lyricsSeekPos !== null) {
                val = Math.round(_lyricsSeekPos);
                _lyricsSeekPos = null;
            } else {
                const fsSlider =
                    e.target.closest?.(SEL.fullscreenSlider) ||
                    (e.target.matches?.(SEL.fullscreenSlider)
                        ? e.target
                        : null);
                const slider = fsSlider || getSlider();
                if (!slider) return;
                val = parseInt(slider.value);
            }

            if (!isNaN(val) && wss && wss.readyState === WebSocket.OPEN) {
                wss.send(
                    JSON.stringify({
                        type: "seek",
                        position: val,
                        roomId: ROOM_ID,
                    }),
                );
                setActiveSender(CLIENT_ID);
                console.log("📤 seek →server (instant):", val);
            }
        }

        document.addEventListener("pointerdown", onSliderDown, true);
        document.addEventListener("mousedown", onSliderDown, true);
        document.addEventListener("pointerup", onSeekEnd, true);
        document.addEventListener("mouseup", onSeekEnd, true);
    }

    // ─── Path observer ───────────────────────────────────────────────────

    function getAlbumPath() {
        const bar = document.querySelector(SEL.playerBar);
        if (!bar) return null;
        const link = bar.querySelector(SEL.albumLink);
        if (!link) return null;
        return link.getAttribute("href") || null;
    }

    // ─── Send debounce ───────────────────────────────────────────────────

    const SEND_DELAY_MS = 1000;
    let _navigateTimer = null;

    function debouncedNavigate(p) {
        clearTimeout(_navigateTimer);
        _navigateTimer = setTimeout(() => {
            if (!wss || wss.readyState !== WebSocket.OPEN) return;
            lastSentPath = p;
            wss.send(
                JSON.stringify({ type: "navigate", path: p, roomId: ROOM_ID }),
            );
            setActiveSender(CLIENT_ID);
            console.log("📤 navigate →server (debounced):", p);
        }, SEND_DELAY_MS);
    }

    function trySend(p) {
        if (!p || isInitializing || isNavigating || isSyncPaused) return;
        if (p === _suppressSend) {
            _suppressSend = null;
            lastSentPath = p;
            return;
        }
        const serverPath = serverState ? serverState.path : null;
        if (p === lastSentPath) return;
        if (p === serverPath) {
            lastSentPath = p;
            return;
        }
        debouncedNavigate(p);
    }

    function startObserver() {
        if (observerStarted) return;
        observerStarted = true;
        const init = getAlbumPath();

        let attrObs = null;
        let obsLink = null;
        let lastPolledPath = init || null;

        if (!init) {
            isSyncPaused = true;
            islandSetSyncPaused();
            console.log("⏸️ No album href on start — sync paused");
        }

        setInterval(() => {
            const p = getAlbumPath();

            if (!p && !isSyncPaused && !isNavigating) {
                isSyncPaused = true;
                _pendingSyncAfterNav = false;
                islandSetSyncPaused();
                console.log("⏸️ Album href disappeared — sync paused");
                return;
            }

            if (p && isSyncPaused && !isNavigating && !_userPausedSync) {
                console.log("✅ Album href appeared — auto-resuming sync");
                resumeSync();
            }

            if (isInitializing || isNavigating) return;
            if (!p || p === lastPolledPath) return;
            lastPolledPath = p;
            trySend(p);
            attachAttrObserver();
        }, 1000);

        function attachAttrObserver() {
            const bar = document.querySelector(SEL.playerBar);
            if (!bar) return;
            const link = bar.querySelector(SEL.albumLink);
            if (!link || link === obsLink) return;
            if (attrObs) attrObs.disconnect();
            obsLink = link;
            attrObs = new MutationObserver(() => {
                const p = link.getAttribute("href");
                if (p) {
                    if (isSyncPaused && !isNavigating && !_userPausedSync) {
                        console.log(
                            "✅ Album href appeared (observer) — auto-resuming sync",
                        );
                        resumeSync();
                    } else if (!isSyncPaused) {
                        trySend(p);
                    }
                } else if (!isSyncPaused && !isNavigating) {
                    isSyncPaused = true;
                    islandSetSyncPaused();
                    console.log(
                        "⏸️ Album href removed (observer) — sync paused",
                    );
                }
            });
            attrObs.observe(link, {
                attributes: true,
                attributeFilter: ["href"],
            });
        }

        function attachBarObserver(bar) {
            new MutationObserver(() => {
                const p = getAlbumPath();
                if (p) {
                    if (isSyncPaused && !isNavigating && !_userPausedSync) {
                        console.log(
                            "✅ Album href appeared (bar observer) — auto-resuming sync",
                        );
                        resumeSync();
                    } else if (!isSyncPaused) {
                        trySend(p);
                    }
                } else if (!isSyncPaused && !isNavigating) {
                    isSyncPaused = true;
                    islandSetSyncPaused();
                    console.log(
                        "⏸️ Album href gone (bar observer) — sync paused",
                    );
                }
                attachAttrObserver();
            }).observe(bar, { childList: true, subtree: true });
            attachAttrObserver();
        }

        const bar = document.querySelector(SEL.playerBar);
        if (bar) {
            attachBarObserver(bar);
        } else {
            const waitObs = new MutationObserver(() => {
                const b = document.querySelector(SEL.playerBar);
                if (b) {
                    waitObs.disconnect();
                    attachBarObserver(b);
                }
            });
            waitObs.observe(document.body, { childList: true, subtree: true });
        }
    }
})();
