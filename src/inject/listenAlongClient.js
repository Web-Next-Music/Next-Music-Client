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
    let observerStarted = false;
    let lastSentPath = null;
    let isNavigating = false;
    let pendingPath = null;
    let isApplyingState = false;
    let lastSentPlayHref = null;
    let isSeekingTimeline = false;
    // isInitializing: пока true — не отправляем события (ждём state_sync от сервера)
    let isInitializing = true;
    let initTimeout = null;
    // Серверный эталон, полученный последним state_sync
    let serverState = null; // { path, playing, position, serverTime }
    // Путь, на который сервер велел навигировать — подавляем обратную отправку
    let _suppressSend = null;
    // Флаг: сервер сам применяет seek — не отправлять обратно
    let _suppressSeekSend = false;

    function liftInitializing() {
        if (!isInitializing) return;
        isInitializing = false;
        const href = getPlayIconHref();
        if (href) lastSentPlayHref = href;
        // Запоминаем серверный path как "уже отправленный" — чтобы при первом
        // тике poll не отправить свой локальный трек поверх серверного.
        // Локальный трек будет отправлен только если он ИЗМЕНИТСЯ после этой точки.
        if (serverState && serverState.path) {
            lastSentPath = serverState.path;
        } else {
            const p = getAlbumPath();
            if (p) lastSentPath = p;
        }
        console.log("✅ Initialization complete — lastSentPath:", lastSentPath);
    }

    const XLINK = "http://www.w3.org/1999/xlink";

    // ─── Inject styles ──────────────────────────────────────────────────

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

        /* ───────── OUTER SHELL ───────── */

        #__li_island__ {
            position: fixed;
            top: 20px;
            left: 50%;
            transform-origin: center top;
            z-index: 9999;
            pointer-events: none;
            transform: translateX(-50%) translateY(-140%);
            opacity: 0;
            background: ${islandBg};
            backdrop-filter: blur(${islandBlur});
            border-radius: 1000px;
            border: solid 1px #fff3;
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

        /* ───────── INNER ───────── */

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

        /* ───────── CONTENT FADE (НОВОЕ) ───────── */

        /* плавное исчезновение старого контента */
        #__li_inner__.li-content-fade-out {
            opacity: 0;
            transform: translateY(4px) scale(0.98);
            transition: opacity 0.18s ease, transform 0.18s ease;
        }

        /* появление нового контента */
        #__li_inner__.li-content-fade-in {
            opacity: 1;
            transform: translateY(0) scale(1);
            transition: opacity 0.22s ease, transform 0.22s ease;
        }

        /* ───────── SHRINK / EXPAND ───────── */

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

        /* ───────── DOT ───────── */

        #__li_dot__ {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            transition:
                background 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity 0.35s ease;
        }

        #__li_dot__.disconnected { background: #555; }
        #__li_dot__.connected    { background: #1db954; animation: liPulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        #__li_dot__.switching    { transform: scale(0); opacity: 0; }

        /* ───────── STATUS TEXT ───────── */

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

        /* ───────── AVATARS ───────── */

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

        /* ───────── AVATAR ───────── */

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

        /* ───────── ANIMATIONS ───────── */

        @keyframes liPulse {
            0%, 100% { opacity: 1;  transform: scale(1); }
            50%      { opacity: 0.4; transform: scale(0.7); }
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

        const dot = document.createElement("span");
        dot.id = "__li_dot__";
        dot.className = "disconnected";

        const status = document.createElement("span");
        status.id = "__li_status__";
        status.textContent = "No server configured";
        status.style.color = "#888";

        const avatarRow = document.createElement("div");
        avatarRow.id = "__li_avatars__";

        inner.appendChild(dot);
        inner.appendChild(status);
        inner.appendChild(avatarRow);
        island.appendChild(inner);
        document.body.appendChild(island);
    }

    buildIsland();

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

    // Плавно анимирует ширину #__li_inner__ при изменении содержимого
    function animateInnerWidth(changeFn) {
        const inner = document.getElementById("__li_inner__");
        if (!inner) {
            changeFn();
            return;
        }

        const fromW = inner.getBoundingClientRect().width;

        // Фиксируем текущую ширину
        inner.style.width = fromW + "px";

        // Временно отключаем transition
        inner.style.transition = "none";

        // 👉 ВАЖНО: применяем изменения полностью
        changeFn();

        // 👉 Принудительно раскрываем аватар-row БЕЗ анимации
        const avRow = document.getElementById("__li_avatars__");
        if (avRow && avRow.classList.contains("visible")) {
            avRow.style.transition = "none";
            avRow.style.maxWidth = "none";
            avRow.style.opacity = "1";
        }

        // Получаем финальную ширину
        inner.style.width = "";
        const toW = inner.getBoundingClientRect().width;

        // Возвращаем исходную ширину
        inner.style.width = fromW + "px";
        void inner.offsetWidth;

        // Включаем анимацию
        inner.style.transition = "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)";
        inner.style.width = toW + "px";

        inner.addEventListener("transitionend", function handler(e) {
            if (e.propertyName !== "width") return;

            inner.style.transition = "";
            inner.style.width = "";

            // Возвращаем transition аватарам
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

    function islandSetDisconnected() {
        clearTimeout(statusHideTimer);
        const island = document.getElementById("__li_island__");
        const dot = document.getElementById("__li_dot__");
        const status = document.getElementById("__li_status__");
        const avRow = document.getElementById("__li_avatars__");

        // Анимируем смену dot
        if (dot) {
            dot.classList.add("switching");
            setTimeout(() => {
                dot.className = "disconnected";
            }, 300);
        }

        if (status) {
            // Плавно меняем текст
            status.style.opacity = "0";
            status.style.transform = "translateY(4px)";
            setTimeout(() => {
                status.className = "";
                status.style.color = "#888";
                status.textContent = "Disconnected";
                status.style.opacity = "";
                status.style.transform = "";
                status.classList.add("appearing");
                setTimeout(() => status.classList.remove("appearing"), 400);
            }, 250);
        }

        if (avRow) avRow.className = "";

        if (_islandVisible) {
            hideIslandAfter(3000);
        }
    }

    function islandSetConnected(serverHost) {
        clearTimeout(statusHideTimer);
        showIsland();

        const dot = document.getElementById("__li_dot__");
        const status = document.getElementById("__li_status__");

        // Анимируем смену dot
        if (dot) {
            dot.classList.add("switching");
            setTimeout(() => {
                dot.className = "connected";
            }, 300);
        }

        if (status) {
            status.style.transition = "none";
            status.classList.remove("hidden");
            void status.offsetWidth;
            status.style.transition = "";

            status.style.opacity = "0";
            status.style.transform = "translateY(4px)";
            setTimeout(() => {
                status.className = "";
                status.style.color = "#1db954";
                status.textContent = `Connected to ${serverHost}`;
                status.style.opacity = "";
                status.style.transform = "";
                status.classList.add("appearing");
                setTimeout(() => status.classList.remove("appearing"), 400);
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

    function seekTo(value) {
        const slider = getSlider();
        if (!slider) return;
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        ).set;
        setter.call(slider, value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(
            new PointerEvent("pointerup", { bubbles: true, cancelable: true }),
        );
        slider.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
        );
        slider.dispatchEvent(new Event("change", { bubbles: true }));
        console.log(`⏱️ Seek → ${value}/${slider.max}`);
    }

    // ─── WebSocket ──────────────────────────────────────────────────────

    function connect() {
        if (!WSS_HOST || !ROOM_ID) {
            const dot = document.getElementById("__li_dot__");
            const status = document.getElementById("__li_status__");
            if (dot) dot.className = "disconnected";
            if (status) {
                status.className = "";
                status.style.color = "#e05c5c";
                status.textContent = !WSS_HOST
                    ? "No server configured"
                    : "No room configured";
            }
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

            // ── state_sync — единственный источник истины ────────────────
            // Сервер присылает это после любой команды и каждые 5 секунд.
            // Клиент синхронизируется с сервером безусловно (кроме
            // момента, когда сам перематывает — isSeekingTimeline).
            if (msg.type === "state_sync") {
                serverState = msg;

                // Подсветка: обновляем только если это ДРУГОЙ клиент управляет.
                // Если by === CLIENT_ID — мы уже подсветили себя в момент отправки команды,
                // повторный вызов лишний. Heartbeat/server не трогают подсветку совсем.
                if (
                    msg.by &&
                    msg.by !== CLIENT_ID &&
                    msg.by !== "heartbeat" &&
                    msg.by !== "server" &&
                    msg.by !== "server-admin"
                ) {
                    setActiveSender(msg.by);
                }

                // 1. Навигация к нужному треку
                // Игнорируем если: уже навигируем, уже на этом пути, или это наш собственный navigate
                // (lastSentPath === msg.path означает что МЫ отправили эту команду).
                const currentPath = getAlbumPath();
                const needNav =
                    msg.path &&
                    msg.path !== currentPath &&
                    msg.path !== lastSentPath && // мы сами не инициировали это
                    !isNavigating;
                if (needNav) {
                    // Блокируем observer — когда router.push меняет path в PlayerBar,
                    // трекер не должен отправлять его обратно на сервер
                    _suppressSend = msg.path;
                    pendingPath = msg.path;
                    processNext();
                }

                // 2. Play / Pause — только если не мы сами только что нажали
                if (!isNavigating && !isApplyingState) {
                    applyPlayState(msg.playing);
                }

                // 3. Позиция: учитываем задержку сети
                if (!isSeekingTimeline && !isNavigating) {
                    const slider = getSlider();
                    if (slider) {
                        const networkDelay =
                            (Date.now() - (msg.serverTime || Date.now())) /
                            1000;
                        const targetPos = msg.playing
                            ? msg.position + networkDelay
                            : msg.position;
                        const diff = Math.abs(
                            parseInt(slider.value) - targetPos,
                        );
                        if (diff > SYNC_THRESHOLD_SEC) {
                            console.log(
                                `🔄 Sync: diff=${diff.toFixed(1)}s → ${targetPos.toFixed(1)}s`,
                            );
                            isSeekingTimeline = true;
                            _suppressSeekSend = true; // не отправлять обратно на сервер
                            seekTo(Math.round(targetPos));
                            setTimeout(() => {
                                isSeekingTimeline = false;
                                _suppressSeekSend = false;
                            }, 2000);
                        }
                    }
                }

                // Снимаем initializing после первого state_sync
                if (isInitializing) {
                    clearTimeout(initTimeout);
                    initTimeout = setTimeout(liftInitializing, 1500);
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
        buildIsland();
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
        isNavigating = true;
        console.log("🔗 Navigate:", p);
        if (window.location.pathname !== p) window.next.router.push(p);
        waitForTrackAndPlay(p);
    }
    function finishNavigation() {
        isNavigating = false;
        // Не сбрасываем lastSentPath здесь — это сделает trySend/_suppressSend
        processNext();
    }
    function waitForTrackAndPlay(expectedPath) {
        let attempts = 0;
        const wait = setInterval(() => {
            if (pendingPath) {
                clearInterval(wait);
                isNavigating = false;
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
                        finishNavigation();
                    }, 1000);
                }, 300);
                return;
            }
            if (++attempts >= 40) {
                clearInterval(wait);
                finishNavigation();
                console.warn("⚠️ Timed out waiting for track");
            }
        }, 500);
    }

    // ─── Play/Pause sync ────────────────────────────────────────────────

    function sendPlayState(href) {
        if (!wss || wss.readyState !== WebSocket.OPEN) return;
        if (isInitializing) return;
        if (href === lastSentPlayHref) return;
        lastSentPlayHref = href;
        // Отправляем команду на сервер — он обновит эталон и разошлёт state_sync
        wss.send(JSON.stringify({ type: "playstate", href, roomId: ROOM_ID }));
        setActiveSender(CLIENT_ID); // пользователь сам нажал
        console.log("📤 playstate →server:", href);
    }

    /** Применить play/pause из серверного state_sync */
    function applyPlayState(wantPlay) {
        const myHref = getPlayIconHref();
        if (!myHref) return;
        const currentlyPlaying =
            myHref.includes("pause") || myHref.includes("Pause");
        if (currentlyPlaying === wantPlay) return;
        isApplyingState = true;
        // Превентивно блокируем observer: запоминаем текущий href,
        // чтобы он не отправил изменение обратно на сервер.
        // После клика href изменится — тогда lastSentPlayHref тоже обновим.
        lastSentPlayHref = myHref;
        clickPlayIcon();
        // После клика обновляем lastSentPlayHref на новое значение
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
            if (isApplyingState || isNavigating) return;
            const href = getPlayIconHref();
            if (!href || href === lastHref) return;
            lastHref = href;
            sendPlayState(href);
        }

        // Polling-фолбэк: на Linux SVG-атрибуты могут не триггерить MutationObserver
        setInterval(check, 1000);

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

    // ─── Timeline sync (seek-only — периодику делает сервер) ────────────

    let _timelineObserverStarted = false;
    function startTimelineObserver() {
        if (_timelineObserverStarted) return;
        _timelineObserverStarted = true;

        // Три источника перемотки:
        //   1. input[aria-label="Manage time code"]          — основной слайдер в PlayerBar
        //   2. input.FullscreenPlayerDesktopContent_slider__* — слайдер в полноэкранном режиме
        //   3. [class*="SyncLyricsLine_root__"]               — клик по строке текста

        // Timestamp последнего реального down на любом из источников.
        // onSeekEnd отправляет только если up пришёл в течение 500мс.
        let _sliderDownAt = 0;
        // Позиция, заготовленная при клике по строке текста (секунды)
        let _lyricsSeekPos = null;

        function isSeekSource(el) {
            if (!el) return false;
            return !!(
                el.closest?.(SEL.timeSlider) ||
                el.closest?.(SEL.fullscreenSlider) ||
                el.matches?.(SEL.fullscreenSlider) ||
                el.closest?.(SEL.lyricsLine)
            );
        }

        function onSliderDown(e) {
            if (!isSeekSource(e.target)) return;
            _sliderDownAt = Date.now();
            _lyricsSeekPos = null;

            // Для строки текста — читаем позицию прямо при нажатии,
            // т.к. после клика таймлайн может ещё не обновиться
            const lyricLine = e.target.closest?.(SEL.lyricsLine);
            if (lyricLine) {
                // data-start-time или аналог; пробуем несколько атрибутов
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
            if (isInitializing || isNavigating) return;
            if (!isSeekSource(e.target)) return;

            isSeekingTimeline = false;

            // Если seek запустил сам клиент в ответ на state_sync — не отправляем обратно
            if (_suppressSeekSend) {
                _suppressSeekSend = false;
                return;
            }

            // Отправляем только если был реальный клик (не автодвижение таймлайна)
            const timeSinceDown = Date.now() - _sliderDownAt;
            if (timeSinceDown > 500) {
                console.log(
                    `⏭️ seek ignored — no recent click (${timeSinceDown}ms ago)`,
                );
                return;
            }

            // Определяем позицию
            let val;
            if (_lyricsSeekPos !== null) {
                // Клик по строке текста — используем заготовленную позицию
                val = Math.round(_lyricsSeekPos);
                _lyricsSeekPos = null;
            } else {
                // Слайдер — берём текущее value (основной или fullscreen)
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
                console.log("📤 seek →server:", val);
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
    function trySend(p) {
        if (!p || isInitializing || isNavigating) return;
        // Если сервер сам велел нам перейти на этот path — не отправляем его обратно
        if (p === _suppressSend) {
            _suppressSend = null;
            lastSentPath = p;
            return;
        }
        // Не отправляем если:
        //   - это тот же путь что мы последний раз отправляли (дедупликация)
        //   - ИЛИ сервер уже стоит на этом пути (незачем дублировать)
        const serverPath = serverState ? serverState.path : null;
        if (p === lastSentPath) return;
        if (p === serverPath) {
            // Сервер уже на этом треке — просто обновляем lastSentPath
            // чтобы не отправить его повторно позже
            lastSentPath = p;
            return;
        }
        lastSentPath = p;
        if (wss && wss.readyState === WebSocket.OPEN) {
            wss.send(
                JSON.stringify({ type: "navigate", path: p, roomId: ROOM_ID }),
            );
            setActiveSender(CLIENT_ID);
        }
    }

    function startObserver() {
        if (observerStarted) return;
        observerStarted = true;
        // Не отправляем трек при старте — ждём state_sync от сервера.
        // lastPolledPath инициализируем текущим значением, чтобы первый тик
        // poll не считал это "изменением".
        const init = getAlbumPath();

        let attrObs = null;
        let obsLink = null;

        let lastPolledPath = init || null;
        setInterval(() => {
            if (isInitializing || isNavigating) return;
            const p = getAlbumPath();
            if (!p || p === lastPolledPath) return;
            lastPolledPath = p; // обновляем в любом случае, чтобы не дёргать повторно
            trySend(p);
            attachAttrObserver();
        }, 1500);

        function attachAttrObserver() {
            const bar = document.querySelector(SEL.playerBar);
            if (!bar) return;
            const link = bar.querySelector(SEL.albumLink);
            if (!link || link === obsLink) return;
            if (attrObs) attrObs.disconnect();
            obsLink = link;
            attrObs = new MutationObserver(() => {
                const p = link.getAttribute("href");
                if (p) trySend(p);
            });
            attrObs.observe(link, {
                attributes: true,
                attributeFilter: ["href"],
            });
        }

        function attachBarObserver(bar) {
            new MutationObserver(() => {
                const p = getAlbumPath();
                if (p) trySend(p);
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
