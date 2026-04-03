{
    const webpackGlobal = window.webpackChunk_N_E;
    let appRequire = null;
    webpackGlobal.push([
        [Symbol()],
        {},
        (r) => {
            appRequire = r;
        },
    ]);
    webpackGlobal.pop();

    const VE = appRequire(46663).VE;
    const found = [];

    function searchFiber(fiber, cls, depth = 0) {
        if (!fiber || depth > 50) return;
        if (fiber.stateNode instanceof cls) found.push(fiber.stateNode);
        let state = fiber.memoizedState;
        while (state) {
            if (state.memoizedState instanceof cls)
                found.push(state.memoizedState);
            state = state.next;
        }
        function searchObj(obj, visited = new Set()) {
            if (!obj || typeof obj !== "object" || visited.has(obj)) return;
            visited.add(obj);
            if (obj instanceof cls) {
                found.push(obj);
                return;
            }
            for (const v of Object.values(obj)) searchObj(v, visited);
        }
        searchObj(fiber.memoizedProps);
        searchFiber(fiber.child, cls, depth + 1);
        searchFiber(fiber.sibling, cls, depth + 1);
    }

    const rootEl = document.getElementById("__next") || document.body;
    const fiberKey = Object.keys(rootEl).find((k) =>
        k.startsWith("__reactFiber"),
    );
    searchFiber(rootEl[fiberKey], VE);

    window._ymPlayers = [...new Map(found.map((p) => [p.id, p])).values()];

    function getMainPlayer() {
        // Если есть живой инстанс — используем
        const cached = window._ymPlayers?.find((p) => p.id === "MAIN");
        if (cached) return cached;

        // Иначе ищем заново
        const webpackGlobal = window.webpackChunk_N_E;
        let appRequire = null;
        webpackGlobal.push([
            [Symbol()],
            {},
            (r) => {
                appRequire = r;
            },
        ]);
        webpackGlobal.pop();

        const VE = appRequire(46663).VE;
        const found = [];

        function searchFiber(fiber, cls, depth = 0) {
            if (!fiber || depth > 50) return;
            if (fiber.stateNode instanceof cls) found.push(fiber.stateNode);
            let state = fiber.memoizedState;
            while (state) {
                if (state.memoizedState instanceof cls)
                    found.push(state.memoizedState);
                state = state.next;
            }
            function searchObj(obj, visited = new Set()) {
                if (!obj || typeof obj !== "object" || visited.has(obj)) return;
                visited.add(obj);
                if (obj instanceof cls) {
                    found.push(obj);
                    return;
                }
                for (const v of Object.values(obj)) searchObj(v, visited);
            }
            searchObj(fiber.memoizedProps);
            searchFiber(fiber.child, cls, depth + 1);
            searchFiber(fiber.sibling, cls, depth + 1);
        }

        const rootEl = document.getElementById("__next") || document.body;
        const fiberKey = Object.keys(rootEl).find((k) =>
            k.startsWith("__reactFiber"),
        );
        searchFiber(rootEl[fiberKey], VE);

        window._ymPlayers = [...new Map(found.map((p) => [p.id, p])).values()];
        return window._ymPlayers.find((p) => p.id === "MAIN");
    }

    function getCurrentMeta() {
        const player = getMainPlayer();
        if (!player) return null;
        const queue = player.queueController;
        const entityList = queue?.playerQueue?.queueState?.entityList?.value;
        const idx = player.playbackState?.queueState?.index?.value;
        if (idx == null || !entityList) return null;
        return entityList[idx]?.entity?.entityData?.meta ?? null;
    }

    window.nextmusicApi = {
        // ── скачивание ассета ─────────────────────────────────────────────
        /**
         * Скачивает файл по URL и сохраняет его в папку assets темы.
         * @param {string} url        - URL файла для скачивания
         * @param {string} fileName   - Имя файла для сохранения (например, "icon.png")
         * @param {string} addonName  - Имя папки аддона (темы), куда класть файл
         * @returns {Promise<{ok: boolean, fileName: string, path: string}>}
         */
        async downloadAsset(url, fileName, addonName) {
            const port = window.__nextmusicApiAssetPort ?? 2007;
            const res = await fetch(
                `http://127.0.0.1:${port}/download_asset?name=${encodeURIComponent(addonName)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url, fileName }),
                },
            );
            if (!res.ok) {
                const text = await res.text();
                throw new Error(
                    `[downloadAsset] Server error ${res.status}: ${text}`,
                );
            }
            return res.json();
        },

        // ── текст в TitleBar ──────────────────────────────────────────
        nextText(text) {
            let el = document.querySelector(".TitleBar_nextText");
            if (text === "") {
                if (el) el.textContent = "";
            } else {
                if (el) el.textContent = text;
            }
        },

        // ── воспроизведение ───────────────────────────────────────────
        playTrackById(trackId) {
            const player = getMainPlayer();
            const queue = player.queueController;
            const currentIndex = player.playbackState.queueState.index.value;

            queue.inject({
                entitiesData: [
                    {
                        type: "music",
                        meta: { id: String(trackId), realId: String(trackId) },
                        fromCurrentContext: false,
                        loadEntityMeta: true,
                    },
                ],
                position: currentIndex + 1,
                silent: false,
            });

            setTimeout(() => {
                const entityList =
                    queue.playerQueue.queueState.entityList.value;
                const idx = entityList.findIndex(
                    (e) => e?.entity?.entityData?.meta?.id === String(trackId),
                );
                if (idx !== -1) {
                    player.setEntityByIndex(idx);
                    player.play();
                } else {
                    console.warn(
                        "[nextmusicApi] Track not found in queue:",
                        trackId,
                    );
                }
            }, 100);
        },

        setSpeed(speed) {
            getMainPlayer()?.setSpeed(speed);
        },

        setProgress(progress) {
            getMainPlayer()?.setProgress(progress);
        },

        setVolume(volume) {
            getMainPlayer()?.setVolume(volume);
        },

        play() {
            getMainPlayer()?.play();
        },

        pause() {
            getMainPlayer()?.pause();
        },

        resume() {
            getMainPlayer()?.resume();
        },

        togglePause() {
            getMainPlayer()?.togglePause();
        },

        next() {
            getMainPlayer()?.moveForward();
        },

        prev() {
            getMainPlayer()?.moveBackward();
        },

        // ── текущий трек ──────────────────────────────────────────────
        getCurrentTrack() {
            const meta = getCurrentMeta();
            if (!meta) return null;

            const coverUri = meta.coverUri
                ? "https://" + meta.coverUri.replace("%%", "400x400")
                : null;

            const artists = (meta.artists ?? []).map((a) => ({
                id: a.id,
                name: a.name,
            }));

            return {
                id: meta.id,
                realId: meta.realId,
                title: meta.title,
                version: meta.version ?? null,
                artists,
                artistIds: artists.map((a) => a.id),
                artistNames: artists.map((a) => a.name),
                albumId: meta.albums?.[0]?.id ?? null,
                coverUrl: coverUri,
                trackUrl: `https://music.yandex.ru/track/${meta.id}`,
                durationMs: meta.durationMs ?? null,
                contentWarning: meta.contentWarning ?? null,
            };
        },

        // ── состояние плеера ──────────────────────────────────────────
        getState() {
            const player = getMainPlayer();
            if (!player) return null;
            const ps = player.playbackState;
            return {
                status: ps?.playerState?.status?.value,
                progress: ps?.playerState?.progress?.value,
                volume: ps?.playerState?.volume?.value,
                shuffle: ps?.playerState?.shuffle?.value,
                repeat: ps?.playerState?.repeatMode?.value,
            };
        },
    };

    console.log("[nextmusicApi] Ready!");
    console.log("API:", Object.keys(window.nextmusicApi));
}
