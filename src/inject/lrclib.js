(async function YMLrc() {
	"use strict";

	const FAKE = "https://music-lyrics.s3-private.mds.yandex.net/custom/";
	const G = (window.__ymlrc ??= {
		trackMeta: new Map(),
		lrclibCache: new Map(),
		lastTrackId: null,
	});

	// MST helpers
	function mstPatch(obj, patches) {
		const proto = Object.getPrototypeOf(obj.$treenode);
		if (!proto.__lrcPatched) {
			proto.__lrcPatched = true;
			proto.assertWritable = function (e) {
				this.assertAlive(e);
			};
		}
		obj.$treenode._applyPatches(patches);
	}

	// Walk React fiber tree to find MST stores
	function findStores() {
		const KEYS = ["lyrics", "lyricId", "loadingState", "trackId", "writers"];
		const root = document.getElementById("__next") ?? document.body;
		const visited = new Set(),
			found = [];

		function walk(obj, path = "", depth = 0) {
			if (!obj || typeof obj !== "object" || depth > 8 || visited.has(obj))
				return;
			visited.add(obj);
			if (Object.keys(obj).filter((k) => KEYS.includes(k)).length >= 3) {
				found.push({ path, obj });
				return;
			}
			for (const [k, v] of Object.entries(obj))
				try {
					walk(v, path ? `${path}.${k}` : k, depth + 1);
				} catch {}
		}

		function walkFiber(f, d = 0) {
			if (!f || d > 120) return;
			try {
				walk(f.stateNode, "s");
			} catch {}
			for (let s = f.memoizedState; s; s = s.next) {
				try {
					walk(s.memoizedState, "ms");
				} catch {}
				try {
					walk(s.queue?.lastRenderedState, "q");
				} catch {}
			}
			walkFiber(f.child, d + 1);
			walkFiber(f.sibling, d + 1);
		}

		const fk = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
		if (fk) walkFiber(root[fk]);

		const syncStore = found.find((f) => f.path.includes("syncLyrics"))?.obj;
		if (!syncStore) return null;

		let node = syncStore.$treenode;
		while (node._parent) node = node._parent;
		const rootSV = node.storedValue;

		let tnode = syncStore.$treenode;
		let prefixlessResource = null;
		while (tnode) {
			prefixlessResource ??= tnode.environment?.prefixlessResource;
			tnode = tnode._parent;
		}

		return {
			syncStore,
			em: rootSV?.sonataState?.entityMeta,
			prefixlessResource,
			rootSV,
		};
	}

	// lrclib.net API
	async function fetchLrc(url, pick = (d) => d.syncedLyrics) {
		try {
			const r = await fetch(url, {
				headers: { "Next-Music-Client": __APP_VERSION__ },
			});
			return r.ok ? (pick(await r.json()) ?? null) : null;
		} catch {
			return null;
		}
	}

	async function getLrc(trackId) {
		if (G.lrclibCache.has(trackId)) return G.lrclibCache.get(trackId);
		const meta = G.trackMeta.get(trackId);
		if (!meta?.title) {
			G.lrclibCache.set(trackId, null);
			return null;
		}

		const { title, artist } = meta;
		const lrc =
			(await fetchLrc(
				`https://lrclib.net/api/get?${new URLSearchParams({ track_name: title, artist_name: artist })}`,
			)) ??
			(await fetchLrc(
				`https://lrclib.net/api/search?${new URLSearchParams({ q: `${artist} ${title}` })}`,
				(d) => d[0]?.syncedLyrics,
			));

		G.lrclibCache.set(trackId, lrc);
		return lrc;
	}

	// Intercept getLyricsText to serve lrclib lyrics for FAKE urls
	function patchLyricsText(pr) {
		const proto = Object.getPrototypeOf(pr);
		const orig = (proto.__lrcOrig ??= proto.getLyricsText);
		proto.getLyricsText = async function (url, ...rest) {
			const s = String(url ?? "");
			if (s.startsWith(FAKE))
				return G.lrclibCache.get(s.replace(FAKE, "").split("?")[0]) ?? "";
			return orig.call(this, url, ...rest);
		};
	}

	// Load and inject lyrics for the current track
	async function loadForTrack({ syncStore, em, prefixlessResource }) {
		const trackId = String(em?.id ?? "");
		const title = em?.title ?? "";
		const artist = em?.artists?.[0]?.name ?? "";
		if (!trackId || !title) return;

		G.trackMeta.set(trackId, { title, artist });
		const lrc = await getLrc(trackId);
		if (!lrc) return;

		if (prefixlessResource) patchLyricsText(prefixlessResource);

		try {
			mstPatch(em, [
				{ op: "replace", path: "/hasLyrics", value: true },
				{ op: "replace", path: "/hasSyncLyrics", value: true },
			]);
		} catch (e) {
			console.error("[LRCLib] entity meta patch failed:", e.message);
		}

		try {
			await syncStore.downloadSyncLyrics(`${FAKE}${trackId}`);
		} catch {
			return;
		}

		try {
			mstPatch(syncStore, [
				{ op: "replace", path: "/loadingState", value: "RESOLVE" },
				{ op: "replace", path: "/currentTrackId", value: trackId },
				{ op: "replace", path: "/isVisible", value: true },
			]);
		} catch (e) {
			console.error("[LRCLib] sync store patch failed:", e.message);
		}
	}

	// Re-apply hasLyrics if YM resets it for a track we have lyrics for
	function watchHasLyrics(rootSV) {
		if (G._emWatch) return;
		G._emWatch = true;

		function install() {
			const em = rootSV?.sonataState?.entityMeta;
			if (!em?.$treenode || em.$treenode.__lrcEmWatch) return false;
			em.$treenode.__lrcEmWatch = true;

			const orig = em.$treenode._applySnapshot.bind(em.$treenode);
			em.$treenode._applySnapshot = function (snap) {
				orig(snap);
				const id = String(snap?.id ?? "");
				if (
					id &&
					G.lrclibCache.get(id) &&
					(!snap?.hasLyrics || !snap?.hasSyncLyrics)
				) {
					setTimeout(() => {
						try {
							const cur = rootSV?.sonataState?.entityMeta;
							if (String(cur?.id ?? "") === id)
								mstPatch(cur, [
									{ op: "replace", path: "/hasLyrics", value: true },
									{ op: "replace", path: "/hasSyncLyrics", value: true },
								]);
						} catch {}
					}, 30);
				}
			};
			return true;
		}

		if (!install()) {
			const t = setInterval(() => install() && clearInterval(t), 1000);
		}
	}

	// Listen for track changes via MobX-State-Tree snapshot
	function watchTrackChanges(rootSV) {
		if (G._sonataWatch) return;
		G._sonataWatch = true;

		rootSV?.sonataState?.$treenode?.onSnapshot(async (snap) => {
			try {
				const id = String(snap?.entityMeta?.id ?? "");
				if (!id || id === G.lastTrackId) return;
				G.lastTrackId = id;
				const s = findStores();
				if (s) await loadForTrack(s);
			} catch {}
		});
	}

	const stores = findStores();
	if (!stores) {
		console.error("[LRCLib] stores not found");
		return;
	}

	const { em, rootSV } = stores;
	watchTrackChanges(rootSV);
	watchHasLyrics(rootSV);

	const trackId = String(em?.id ?? "");
	if (trackId && trackId !== G.lastTrackId) {
		G.lastTrackId = trackId;
		await loadForTrack(stores);
	}
})();
