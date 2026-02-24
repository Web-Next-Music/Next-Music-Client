(async () => {
    const _qs = new URLSearchParams(location.search);

    const _wsHost = _qs.get("__ws") || null;
    const WS_HOST = _wsHost ? "ws://" + _wsHost : null;
    const ROOM_ID = _qs.get("__room") || null;
    const CLIENT_ID = _qs.get("__clientId") || null;
    const AVATAR_URL = _qs.get("__avatarUrl") || null;
    const SYNC_THRESHOLD_SEC = 1;

    let ws = null;
    let observerStarted = false;
    let lastSentPath = null;
    let lastReceivedPath = null;
    let isNavigating = false;
    let pendingPath = null;
    let isApplyingState = false;
    let lastSentPlayHref = null;
    let lastSentTimeline = null;
    let isSeekingTimeline = false;
    // Блокируем исходящие события пока получаем начальное состояние от сервера
    let isInitializing = true;
    let initTimeout = null;
    function liftInitializing() {
        if (!isInitializing) return;
        isInitializing = false;
        // Синхронизируем текущее состояние чтобы observers не отправили его сразу
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

    (function injectStyles() {
        if (document.getElementById("__li_styles__")) return;
        const s = document.createElement("style");
        s.id = "__li_styles__";
        s.textContent = `
            #__li_island__ {
                position: fixed;
                top: 14px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 8px;
                background: #0003;
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                border-radius: 999px;
                padding: 7px 14px 7px 10px;
                z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                color: #fff;
                user-select: none;
                white-space: nowrap;
                cursor: default;
                transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1),
                            padding 0.35s ease,
                            min-width 0.35s ease;
                overflow: visible;
                pointer-ivents: none;
            }

            /* ── dot ── */
            #__li_dot__ {
                width: 8px; height: 8px;
                border-radius: 50%;
                flex-shrink: 0;
                transition: background 0.5s ease;
            }
            #__li_dot__.disconnected  { background: #555; }
            #__li_dot__.connected     { background: #1db954; animation: liPulse 2.5s ease-in-out infinite; }

            /* ── status text ── */
            #__li_status__ {
                font-size: 11px;
                letter-spacing: 0.02em;
                transition: opacity 0.4s ease, max-width 0.4s ease;
                overflow: hidden;
                max-width: 200px;
            }
            #__li_status__.hidden { opacity: 0; max-width: 0; padding: 0; }

            /* ── avatar row ── */
            #__li_avatars__ {
                display: flex;
                align-items: center;
                gap: 5px;
                transition: opacity 0.4s ease, max-width 0.4s ease;
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
                animation: liAvatarIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
            }
            .li-av-wrap.removing { animation: liAvatarOut 0.2s ease forwards; }

            .li-av-img, .li-av-placeholder {
                width: 26px; height: 26px;
                border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.18);
                object-fit: cover;
                display: block;
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
                from { transform: scale(0) rotate(-10deg); opacity: 0; }
                to   { transform: scale(1) rotate(0deg);   opacity: 1; }
            }
            @keyframes liAvatarOut {
                from { transform: scale(1); opacity: 1; }
                to   { transform: scale(0); opacity: 0; }
            }
        `;
        document.head.appendChild(s);
    })();

    // ─── Build island DOM ───────────────────────────────────────────────

    function buildIsland() {
        if (document.getElementById("__li_island__")) return;

        const island = document.createElement("div");
        island.id = "__li_island__";

        const dot = document.createElement("span");
        dot.id = "__li_dot__";
        dot.className = "disconnected";

        const status = document.createElement("span");
        status.id = "__li_status__";
        status.textContent = "No server configured";
        status.style.color = "#888";

        const avatarRow = document.createElement("div");
        avatarRow.id = "__li_avatars__";

        island.appendChild(dot);
        island.appendChild(status);
        island.appendChild(avatarRow);
        document.body.appendChild(island);
    }

    buildIsland();

    // ─── Island state machine ───────────────────────────────────────────

    let statusHideTimer = null;

    function islandSetDisconnected() {
        clearTimeout(statusHideTimer);
        const dot = document.getElementById("__li_dot__");
        const status = document.getElementById("__li_status__");
        const avRow = document.getElementById("__li_avatars__");
        if (dot) dot.className = "disconnected";
        if (status) {
            status.className = "";
            status.style.color = "#888";
            status.textContent = "No server configured";
        }
        if (avRow) avRow.className = "";
    }

    function islandSetConnected(serverHost) {
        clearTimeout(statusHideTimer);
        const dot = document.getElementById("__li_dot__");
        const status = document.getElementById("__li_status__");
        if (dot) dot.className = "connected";
        if (status) {
            status.className = "";
            status.style.color = "#1db954";
            status.textContent = `Connected to ${serverHost}`;
        }
        statusHideTimer = setTimeout(() => {
            if (status) status.className = "hidden";
            const avRow = document.getElementById("__li_avatars__");
            if (avRow) avRow.className = "visible";
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
            wrap.remove();
            islandAvatars.delete(clientId);
        }, 210);
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
            islandSetConnected(serverHost);

            if (!islandAvatars.has(CLIENT_ID)) upsertAvatar(CLIENT_ID, null);

            startObserver();
            startPlayStateObserver();
            startTimelineObserver();
            sendAvatarFromUrl();

            // Если сервер не пришлёт состояние — снимаем блокировку через 5с
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

            if (msg.type === "navigate") {
                if (msg.clientId) setActiveSender(msg.clientId);
                lastReceivedPath = msg.path;
                pendingPath = msg.path;
                if (!isNavigating) processNext();
            } else if (msg.type === "playstate") {
                if (msg.clientId) setActiveSender(msg.clientId);
                applyPlayState(msg.href);
                // После получения playstate от сервера при инициализации
                // ждём timeline и потом снимаем блокировку
                if (isInitializing) {
                    // timeline может не прийти, поэтому страхуемся таймаутом
                    clearTimeout(initTimeout);
                    initTimeout = setTimeout(liftInitializing, 3000);
                }
            } else if (msg.type === "timeline") {
                if (msg.seek && msg.clientId) setActiveSender(msg.clientId);
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
                    // Синхронизируем lastSentTimeline чтобы interval не отправил это значение наружу
                    lastSentTimeline = msg.value;
                    setTimeout(() => {
                        isSeekingTimeline = false;
                    }, 2000);
                }
                // Timeline — последнее из трёх сообщений инициализации
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
            isInitializing = true; // сбрасываем при переподключении
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

            // Если PlayerBar уже играет именно этот трек — навигация завершена, ничего не кликаем
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
                    isNavigating = false;
                    processNext();
                }, 500);
                return;
            }

            const btn = document.querySelector(
                '[class*="TrackModal_modalContent"] * [class*="TrackModalControls_controlsContainer"] > button',
            );
            if (urlMatch && btn) {
                clearInterval(wait);
                setTimeout(() => {
                    // Ещё раз проверяем — вдруг за эти 300мс трек уже запустился
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
                        isNavigating = false;
                        processNext();
                    }, 1000);
                }, 300);
                return;
            }
            if (++attempts >= 40) {
                clearInterval(wait);
                isNavigating = false;
                processNext();
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
        clickPlayIcon();
        setTimeout(() => {
            isApplyingState = false;
        }, 500);
    }

    // OPTIMISATION A: Play state observer — use only MutationObserver,
    // drop the redundant setInterval polling.
    // Narrow the observe scope to the player bar instead of entire body.
    function startPlayStateObserver() {
        let lastHref = null;
        function check() {
            if (isApplyingState || isNavigating) return;
            const href = getPlayIconHref();
            if (!href || href === lastHref) return;
            lastHref = href;
            sendPlayState(href);
        }

        // OPTIMISATION: watch only the player bar subtree, not full body.
        // Falls back to body if bar not yet mounted.
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

        // Wait for player bar to exist before attaching
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

    // OPTIMISATION B: Only send timeline if value actually changed.
    // Keep 1s interval but skip if same as last sent value.
    function startTimelineObserver() {
        setInterval(() => {
            if (isInitializing || isNavigating || isSeekingTimeline) return;
            const slider = getSlider();
            if (!slider) return;
            const val = parseInt(slider.value);
            // Skip if unchanged (saves majority of sends during paused state)
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

        // Manual seek — broadcast immediately with seek:true flag
        function onSeekEnd(e) {
            if (isInitializing || isSeekingTimeline || isNavigating) return;
            const slider = getSlider();
            if (!slider || e.target !== slider) return;
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
        if (
            !p ||
            isInitializing ||
            isNavigating ||
            p === lastSentPath ||
            p === lastReceivedPath
        )
            return;
        lastSentPath = p;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
                JSON.stringify({ type: "navigate", path: p, roomId: ROOM_ID }),
            );
            setActiveSender(CLIENT_ID);
        }
    }

    // OPTIMISATION C: Path observer — scope MutationObserver to PlayerBar,
    // avoiding full-document subtree scans on every DOM mutation.
    function startObserver() {
        if (observerStarted) return;
        observerStarted = true;
        const init = getAlbumPath();
        if (init) trySend(init);

        let attrObs = null;
        let obsLink = null;

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

        // Watch for link changes inside player bar only
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
            // Player bar not mounted yet — wait for it with a single body observer
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
