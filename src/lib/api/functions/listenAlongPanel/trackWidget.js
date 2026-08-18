const TRACK_LINK_RE =
	/music\.yandex\.[a-z]+\/album\/(\d+)\/track\/(\d+)|music\.yandex\.[a-z]+\/track\/(\d+)|music\.yandex\.[a-z]+\/album\/(\d+)(?!\/track)/i;

function parseTrackLink(text) {
	const m = TRACK_LINK_RE.exec(text || "");
	if (!m) return null;
	if (m[2]) return { type: "track", id: m[2] };
	if (m[3]) return { type: "track", id: m[3] };
	if (m[4]) return { type: "album", id: m[4] };
	return null;
}

function coverUrlFromUri(coverUri, size) {
	if (!coverUri) return null;
	return coverUri.startsWith("http")
		? coverUri
		: `https://${coverUri.replace("%%", size || "200x200")}`;
}

const _laTrackMetaCache = new Map();

function fetchLinkMeta(link) {
	const cacheKey = `${link.type}:${link.id}`;
	if (_laTrackMetaCache.has(cacheKey)) return _laTrackMetaCache.get(cacheKey);

	const url =
		link.type === "track"
			? `https://api.music.yandex.net/tracks/${link.id}`
			: `https://api.music.yandex.net/albums/${link.id}`;

	const promise = fetch(url)
		.then((res) => (res.ok ? res.json() : null))
		.then((json) => {
			const data =
				link.type === "track" ? json?.result?.[0] : json?.result;
			if (!data) return null;

			if (link.type === "track") {
				return {
					trackId: link.id,
					title: data.title,
					artists: (data.artists ?? []).map((a) => a.name).join(", "),
					coverUrl: coverUrlFromUri(
						data.coverUri ?? data.albums?.[0]?.coverUri,
					),
					durationMs: data.durationMs ?? null,
				};
			}

			return {
				trackId: null,
				title: data.title,
				artists: (data.artists ?? []).map((a) => a.name).join(", "),
				coverUrl: coverUrlFromUri(data.coverUri),
			};
		})
		.catch(() => null);

	_laTrackMetaCache.set(cacheKey, promise);
	return promise;
}

function LaNowPlayingBar(props) {
	const { React, state } = props;
	const h = React.createElement;
	const trackId = state.nowPlaying?.id;
	const playing = !!state.nowPlaying?.playing;
	const [meta, setMeta] = React.useState(undefined);
	const [position, setPosition] = React.useState(0);

	React.useEffect(() => {
		if (!trackId) {
			setMeta(null);
			return;
		}
		let cancelled = false;
		fetchLinkMeta({ type: "track", id: trackId }).then((result) => {
			if (!cancelled) setMeta(result);
		});
		return () => {
			cancelled = true;
		};
	}, [trackId]);

	React.useEffect(() => {
		const basePosition = state.nowPlaying?.position ?? 0;
		const baseServerTime = state.nowPlaying?.serverTime ?? Date.now();
		const elapsed = state.nowPlaying?.playing
			? Math.max(0, (Date.now() - baseServerTime) / 1000)
			: 0;
		setPosition(basePosition + elapsed);

		const api = window.nextmusicApi;
		if (!api || !trackId) return;

		const localPosition = () => {
			const local = api.getCurrentTrack?.();
			return local?.id === trackId
				? (api.getState?.()?.progress?.position ?? null)
				: null;
		};
		const applyLocal = () => {
			const p = localPosition();
			if (p !== null) setPosition(p);
		};
		applyLocal();

		const offTrack = api.onTrackChange?.(applyLocal);
		const offProgress = api.onProgressChange?.((progress) => {
			if (
				typeof progress?.position === "number" &&
				api.getCurrentTrack?.()?.id === trackId
			) {
				setPosition(progress.position);
			}
		});

		return () => {
			offTrack?.();
			offProgress?.();
		};
	}, [trackId]);

	if (!trackId || meta === null) return null;

	const durationSec = (meta?.durationMs ?? 0) / 1000;
	const ratio = durationSec > 0 ? Math.min(1, position / durationSec) : 0;

	return h(
		"div",
		{ className: "nmc-la-panel-nowplaying" },
		meta?.coverUrl
			? h("img", {
					className: "nmc-la-panel-nowplaying-cover",
					src: meta.coverUrl,
					alt: "",
				})
			: h("div", {
					className: "nmc-la-panel-nowplaying-cover skeleton",
				}),
		h(
			"div",
			{ className: "nmc-la-panel-nowplaying-title" },
			meta === undefined
				? "Loading…"
				: meta.artists
					? `${meta.title} - ${meta.artists}`
					: meta.title,
		),
		h(
			"span",
			{
				className: "nmc-la-panel-nowplaying-playpause",
				title: playing ? "Playing" : "Paused",
			},
			playing
				? h(
						"svg",
						{
							width: 12,
							height: 12,
							viewBox: "0 0 16 16",
							fill: "currentColor",
						},
						h("path", { d: "M4 2.5h3v11H4v-11zm5 0h3v11H9v-11z" }),
					)
				: h(
						"svg",
						{
							width: 12,
							height: 12,
							viewBox: "0 0 16 16",
							fill: "currentColor",
						},
						h("path", { d: "M4 2.5v11l10-5.5-10-5.5z" }),
					),
		),
		h("div", {
			className: "nmc-la-panel-nowplaying-timeline",
			style: { width: `${ratio * 100}%` },
		}),
	);
}

function LaTrackWidget(props) {
	const { React, link, isHost, onPlay, nowPlaying } = props;
	const h = React.createElement;
	const [meta, setMeta] = React.useState(undefined);

	React.useEffect(() => {
		let cancelled = false;
		fetchLinkMeta(link).then((result) => {
			if (!cancelled) setMeta(result);
		});
		return () => {
			cancelled = true;
		};
	}, [link.type, link.id]);

	if (meta === null) return null;

	return h(
		"div",
		{ className: "nmc-la-panel-track-widget" },
		meta === undefined
			? h("div", {
					className: "nmc-la-panel-track-widget-cover skeleton",
				})
			: h("img", {
					className: "nmc-la-panel-track-widget-cover",
					src: meta.coverUrl,
					alt: "",
				}),
		h(
			"div",
			{ className: "nmc-la-panel-track-widget-body" },
			h(
				"div",
				{ className: "nmc-la-panel-track-widget-title" },
				meta === undefined ? "Loading…" : meta.title,
			),
			meta?.artists
				? h(
						"div",
						{ className: "nmc-la-panel-track-widget-artists" },
						meta.artists,
					)
				: null,
		),
		isHost && meta?.trackId
			? (() => {
					const isCurrent = nowPlaying?.id === meta.trackId;
					const isPlaying = isCurrent && nowPlaying.playing;
					return h(
						"button",
						{
							type: "button",
							className: "nmc-la-panel-track-widget-play",
							title: isPlaying ? "Pause" : "Play",
							onClick: () => onPlay?.(meta.trackId),
						},
						h(
							"svg",
							{
								width: 12,
								height: 12,
								viewBox: "0 0 16 16",
								fill: "currentColor",
							},
							isPlaying
								? h("path", {
										d: "M4 2.5h3v11H4v-11zm5 0h3v11H9v-11z",
									})
								: h("path", { d: "M4 2.5v11l10-5.5-10-5.5z" }),
						),
					);
				})()
			: null,
	);
}
