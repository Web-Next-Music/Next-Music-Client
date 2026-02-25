(async () => {
    const _qs = new URLSearchParams(location.search);

    const blackIsland = _qs.get("__blackIsland") || null;

    const _wsHost = _qs.get("__ws") || null;
    const WS_HOST = _wsHost ? "ws://" + _wsHost : null;
    const ROOM_ID = _qs.get("__room") || null;
    const CLIENT_ID = _qs.get("__clientId") || null;
    const AVATAR_URL = _qs.get("__avatarUrl") || null;
    const SYNC_THRESHOLD_SEC = 1;

    let ws = null;
    let serverName = null;
    let observerStarted = false;
    let lastSentPath = null;
    let lastReceivedPath = null;
    let isNavigating = false;
    let pendingPath = null;
    let isApplyingState = false;
    let lastSentPlayHref = null;
    let lastSentTimeline = null;
    let isSeekingTimeline = false;
    let isInitializing = true;
    let isMaster = false;
    let initTimeout = null;
    function liftInitializing() {
        if (!isInitializing) return;
        isInitializing = false;
        const slider = getSlider();
        if (slider) lastSentTimeline = parseInt(slider.value);
        const href = getPlayIconHref();
        if (href) lastSentPlayHref = href;
        const path = getAlbumPath();
        if (path) lastSentPath = path;
        console.log("✅ Initialization complete — outbound events enabled");
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

            /* ── outer shell: translateY + opacity ── */
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
                border: solid 1px #fff1;
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

            /* ── inner pill ── */
            #__li_inner__ {
                position: relative;
                display: flex;
                align-items: center;
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
                will-change: transform;
            }
            /* blur на псевдоэлементе — не участвует в scaleX, нет GPU-лага */
            #__li_inner__::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                z-index: -1;
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

            /* контент: фейд до сжатия / после разворачивания */
            #__li_island__.island-hiding #__li_dot__,
            #__li_island__.island-hiding #__li_status__,
            #__li_island__.island-hiding #__li_avatars__ {
                animation: liContentFadeOut 0.12s ease-in forwards !important;
            }
            #__li_island__.island-visible #__li_dot__,
            #__li_island__.island-visible #__li_status__ {
                animation: liContentFadeIn 0.28s cubic-bezier(0.4, 0, 0.2, 1) 0.35s both;
            }

            @keyframes liContentFadeOut {
                to { opacity: 0; }
            }
            @keyframes liContentFadeIn {
                from { opacity: 0; transform: translateY(3px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            /* ── dot ── */
            #__li_dot__ {
                width: 8px; height: 8px;
                border-radius: 50%;
                flex-shrink: 0;
                transition: background 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
            }
            #__li_dot__.disconnected { background: #555; }
            #__li_dot__.connected    { background: #1db954; animation: liPulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            #__li_dot__.switching    { transform: scale(0); opacity: 0; }

            /* ── status text ── */
            #__li_status__ {
                font-size: 12px;
                letter-spacing: 0.02em;
                white-space: nowrap;
                overflow: hidden;
                max-width: 300px;
                transition:
                    opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    color 0.4s ease;
                transform: translateY(0);
                opacity: 1;
            }
            #__li_status__.hidden {
                opacity: 0;
                max-width: 0;
                transform: translateY(3px);
            }
            #__li_status__.appearing {
                animation: liStatusIn 0.38s cubic-bezier(0.34, 1.2, 0.64, 1) both;
            }

            @keyframes liStatusIn {
                from { opacity: 0; transform: translateY(6px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            /* ── avatar row ── */
            #__li_avatars__ {
                display: flex;
                align-items: center;
                gap: 3px;
                transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                overflow: hidden;
                max-width: 0;
                opacity: 0;
            }
            #__li_avatars__.visible {
                max-width: 400px;
                opacity: 1;
            }

            /* ── individual avatar ── */
            .li-av-wrap {
                position: relative;
                flex-shrink: 0;
                animation: liAvatarIn 0.35s both;
            }
            .li-av-wrap.removing { animation: liAvatarOut 0.2s forwards; }

            .li-av-img, .li-av-placeholder {
                width: 26px; height: 26px;
                border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.18);
                object-fit: cover;
                display: block;
                transition: border-color 0.3s ease;
            }
            .li-av-placeholder {
                background: rgba(255,255,255,0.12);
                display: flex; align-items: center; justify-content: center;
                font-size: 11px; font-weight: 600;
                color: rgba(255,255,255,0.7);
            }
            .li-av-wrap.active-sender .li-av-img,
            .li-av-wrap.active-sender .li-av-placeholder {
                border-color: #1db954;
            }

            @keyframes liPulse {
                0%, 100% { opacity: 1;  transform: scale(1); }
                50%       { opacity: 0.4; transform: scale(0.7); }
            }
            @keyframes liAvatarIn {
                from { transform: scale(0) rotate(-12deg); opacity: 0; }
                to   { transform: scale(1) rotate(0deg);   opacity: 1; }
            }
            @keyframes liAvatarOut {
                from { transform: scale(1); opacity: 1; max-width: 32px; margin: 0; }
                to   { transform: scale(0); opacity: 0; max-width: 0;    margin: 0; }
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
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
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
        return document.querySelector(
            '[class*="BaseSonataControlsDesktop_playButtonIcon__"]',
        );
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
        return document.querySelector('[aria-label="Manage time code"]');
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
        if (!WS_HOST || !ROOM_ID) {
            const dot = document.getElementById("__li_dot__");
            const status = document.getElementById("__li_status__");
            if (dot) dot.className = "disconnected";
            if (status) {
                status.className = "";
                status.style.color = "#e05c5c";
                status.textContent = !WS_HOST
                    ? "No server configured"
                    : "No room configured";
            }
            console.warn(
                "Listen Along: missing __ws or __room param — not connecting.",
            );
            return;
        }
        const serverHost = WS_HOST.replace(/^wss?:\/\//, "").split("/")[0];
        const url = `${WS_HOST}?room=${encodeURIComponent(ROOM_ID)}&clientId=${encodeURIComponent(CLIENT_ID || "user_" + Math.random().toString(36).slice(2, 7))}`;
        ws = new WebSocket(url);

        ws.onopen = () => {
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

        ws.onmessage = (event) => {
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

            if (msg.type === "navigate") {
                if (msg.clientId === CLIENT_ID) return;
                if (msg.clientId) setActiveSender(msg.clientId);
                isMaster = false;
                lastReceivedPath = msg.path;
                lastSentPath = null; // позволяем снова отправить этот трек
                pendingPath = msg.path;
                if (!isNavigating) processNext();
            } else if (msg.type === "playstate") {
                if (msg.clientId === CLIENT_ID) return; // своё эхо
                if (msg.clientId) setActiveSender(msg.clientId);
                applyPlayState(msg.href);
                if (isInitializing) {
                    clearTimeout(initTimeout);
                    initTimeout = setTimeout(liftInitializing, 3000);
                }
            } else if (msg.type === "timeline") {
                if (msg.clientId === CLIENT_ID) return; // своё эхо
                // setActiveSender только при seek — обычные тики не должны сбивать подсветку
                if (msg.seek && msg.clientId) setActiveSender(msg.clientId);
                if (!msg.seek && isMaster && !isInitializing) return;
                if (isSeekingTimeline || isNavigating) return;
                const slider = getSlider();
                if (!slider) return;
                const diff = Math.abs(parseInt(slider.value) - msg.value);
                if (diff > SYNC_THRESHOLD_SEC) {
                    console.log(
                        `🔄 Out of sync by ${diff}s — seeking to ${msg.value}`,
                    );
                    isSeekingTimeline = true;
                    seekTo(msg.value);
                    lastSentTimeline = msg.value;
                    setTimeout(() => {
                        isSeekingTimeline = false;
                    }, 2000);
                }
                if (isInitializing) {
                    clearTimeout(initTimeout);
                    initTimeout = setTimeout(liftInitializing, 1500);
                }
            } else if (msg.type === "client_joined") {
                upsertAvatar(msg.clientId, msg.avatar || null);
            } else if (msg.type === "client_left") {
                removeAvatar(msg.clientId);
            } else if (msg.type === "avatar") {
                upsertAvatar(msg.clientId, msg.data);
            } else if (msg.type === "error") {
                console.warn("❌ Server error:", msg.message);
            }
        };

        ws.onerror = () => {};
        ws.onclose = (e) => {
            islandSetDisconnected();
            clearTimeout(initTimeout);
            isInitializing = true;
            isMaster = false;
            if (e.code === 4001) {
                console.error(`🚫 Room [${ROOM_ID}] not found on server`);
                return;
            }
            console.warn("🔌 WS disconnected, reconnecting in 3s...");
            setTimeout(connect, 3000);
        };
    }

    if (!WS_HOST) {
        buildIsland();
        console.warn("Listen Along: no server configured (__ws param missing)");
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
        lastReceivedPath = null;
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

            const btn = document.querySelector(
                '[class*="TrackModal_modalContent"] * [class*="TrackModalControls_controlsContainer"] > button',
            );
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
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (isInitializing) return;
        if (href === lastSentPlayHref) return;
        lastSentPlayHref = href;
        ws.send(JSON.stringify({ type: "playstate", href, roomId: ROOM_ID }));
        setActiveSender(CLIENT_ID);
        console.log("📤 playstate:", href);
    }
    function applyPlayState(senderHref) {
        const myHref = getPlayIconHref();
        if (!myHref || myHref === senderHref) return;
        isApplyingState = true;
        // Превентивно обновляем lastSentPlayHref — чтобы observer
        // не переотправил это состояние обратно в сеть
        lastSentPlayHref = senderHref;
        clickPlayIcon();
        setTimeout(() => {
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
                document.querySelector('[class*="PlayerBar_root"]') ||
                document.body;
            new MutationObserver(check).observe(target, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["href", "xlink:href"],
            });
        }

        if (document.querySelector('[class*="PlayerBar_root"]')) {
            attachObserver();
        } else {
            const waitObs = new MutationObserver(() => {
                if (document.querySelector('[class*="PlayerBar_root"]')) {
                    waitObs.disconnect();
                    attachObserver();
                }
            });
            waitObs.observe(document.body, { childList: true, subtree: true });
        }
    }

    // ─── Timeline sync ───────────────────────────────────────────────────

    let _timelineObserverStarted = false;
    function startTimelineObserver() {
        if (_timelineObserverStarted) return;
        _timelineObserverStarted = true;
        setInterval(() => {
            if (isInitializing || isNavigating || isSeekingTimeline) return;
            const slider = getSlider();
            if (!slider) return;
            const val = parseInt(slider.value);
            if (val === lastSentTimeline) return;
            lastSentTimeline = val;
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(
                    JSON.stringify({
                        type: "timeline",
                        value: val,
                        roomId: ROOM_ID,
                    }),
                );
        }, 1000);

        function onSeekEnd(e) {
            if (isInitializing || isNavigating) return;
            const slider = getSlider();
            if (!slider) return;
            // На Linux событие может всплыть с дочернего — проверяем closest
            const target =
                e.target.closest?.('[aria-label="Manage time code"]') ||
                e.target;
            if (target !== slider) return;
            isSeekingTimeline = false; // сбрасываем входящий seek-lock
            const val = parseInt(slider.value);
            lastSentTimeline = val;
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(
                    JSON.stringify({
                        type: "timeline",
                        value: val,
                        seek: true,
                        roomId: ROOM_ID,
                    }),
                );
            isMaster = false;
            setActiveSender(CLIENT_ID);
        }
        document.addEventListener("pointerup", onSeekEnd, true);
        document.addEventListener("mouseup", onSeekEnd, true);
    }

    // ─── Path observer ───────────────────────────────────────────────────

    function getAlbumPath() {
        const bar = document.querySelector('[class*="PlayerBar_root"]');
        if (!bar) return null;
        const link = bar.querySelector('[class*="Meta_albumLink"]');
        if (!link) return null;
        return link.getAttribute("href") || null;
    }
    function trySend(p) {
        if (!p || isInitializing || isNavigating || p === lastSentPath) return;
        lastSentPath = p;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({ type: "navigate", path: p, roomId: ROOM_ID }),
            );
            isMaster = true;
            setActiveSender(CLIENT_ID);
        }
    }

    function startObserver() {
        if (observerStarted) return;
        observerStarted = true;
        const init = getAlbumPath();
        if (init) trySend(init);

        let attrObs = null;
        let obsLink = null;

        let lastPolledPath = null;
        setInterval(() => {
            if (isInitializing || isNavigating) return;
            const p = getAlbumPath();
            if (!p || p === lastPolledPath) return;
            lastPolledPath = p;
            trySend(p);
            attachAttrObserver();
        }, 1500);

        function attachAttrObserver() {
            const bar = document.querySelector('[class*="PlayerBar_root"]');
            if (!bar) return;
            const link = bar.querySelector('[class*="Meta_albumLink"]');
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

        const bar = document.querySelector('[class*="PlayerBar_root"]');
        if (bar) {
            attachBarObserver(bar);
        } else {
            const waitObs = new MutationObserver(() => {
                const b = document.querySelector('[class*="PlayerBar_root"]');
                if (b) {
                    waitObs.disconnect();
                    attachBarObserver(b);
                }
            });
            waitObs.observe(document.body, { childList: true, subtree: true });
        }
    }
})();
