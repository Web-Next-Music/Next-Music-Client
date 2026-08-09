const SERVER_AVATAR_ID = "server";
const SERVER_AVATAR_URL =
	"data:image/png;base64,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";

let _laPanelRoot = null;
let _laPanelHost = null;
let _laPanelState = null;
let _laPanelHandlers = {};

const LA_PANEL_CSS = `
.nmc-la-panel-bg {
	position: fixed;
	inset: 0;
	z-index: 2147483000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.55);
	padding: var(--ym-spacer-size-xl);
	animation: nmLaPanelFadeIn 0.2s ease;
}
@keyframes nmLaPanelFadeIn {
	from { opacity: 0; }
	to { opacity: 1; }
}
.nmc-la-panel {
	display: flex;
	flex-direction: column;
	width: min(920px, 100%);
	height: min(560px, 85vh);
	border-radius: var(--ym-radius-size-xl);
	border: 0.0625rem solid var(--ym-outline-color-primary-disabled);
	background: var(--ym-background-color-primary-enabled-popover);
	color: var(--ym-controls-color-secondary-on_default-enabled);
	overflow: hidden;
	box-shadow: 0 1rem 3rem var(--ym-shadow-menu);
	animation: nmLaPanelIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes nmLaPanelIn {
	from { opacity: 0; transform: scale(0.96) translateY(8px); }
	to { opacity: 1; transform: scale(1) translateY(0); }
}
.nmc-la-panel-header {
	display: flex;
	align-items: stretch;
	flex-shrink: 0;
	border-bottom: 1px solid var(--ym-controls-color-secondary-text-disabled);
	height: 40px;
}
.nmc-la-panel-title {
	flex: 1 1 auto;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 12px;
	font-size: 0.85rem;
}
.nmc-la-panel-close {
	flex-shrink: 0;
	width: 40px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	border-left: 1px solid var(--ym-controls-color-secondary-text-disabled);
	color: inherit;
	opacity: 0.6;
	cursor: pointer;
	transition: opacity 0.2s ease, background-color 0.2s ease;
}
.nmc-la-panel-close:hover {
	opacity: 1;
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-body {
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
}
.nmc-la-panel-col {
	display: flex;
	flex-direction: column;
	min-width: 0;
}
.nmc-la-panel-roster {
	flex: 0 0 220px;
	border-left: 1px solid var(--ym-controls-color-secondary-text-disabled);
	padding: 10px;
	gap: 12px;
}
.nmc-la-panel-sidebar {
	flex: 0 0 240px;
	border-right: 1px solid var(--ym-controls-color-secondary-text-disabled);
	padding: 0;
	overflow-y: auto;
}
.nmc-la-panel-sidebar-status {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 14px 16px;
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	border-bottom: 1px solid var(--ym-controls-color-secondary-text-disabled);
	transition: opacity 0.2s ease;
}
.nmc-la-panel-sidebar-status:hover {
	opacity: 0.7;
}
.nmc-la-panel-sidebar-status-text {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.nmc-la-panel-server-version {
	flex-shrink: 0;
	margin-left: auto;
	font-size: 0.68rem;
	font-weight: 500;
	opacity: 0.55;
}
.nmc-la-panel-room-name {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 10px;
	border-bottom: 1px solid var(--ym-controls-color-secondary-text-disabled);
}
.nmc-la-panel-room-name-text {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.8rem;
	font-weight: 600;
	opacity: 0.85;
	cursor: pointer;
}
.nmc-la-panel-room-name-text:hover {
	opacity: 1;
	text-decoration: underline;
}
.nmc-la-panel-room-name-input {
	flex: 1 1 auto;
	min-width: 0;
	border-radius: var(--ym-radius-size-s, 4px);
	border: 1px solid var(--ym-controls-color-secondary-outline-selected_stroke);
	background: var(--ym-controls-color-secondary-default-enabled);
	color: inherit;
	padding: 4px 6px;
	font-size: 0.8rem;
	outline: none;
}
.nmc-la-panel-roombar-text {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.85;
}
.nmc-la-panel-roombar-text b {
	font-weight: 700;
}
.nmc-la-panel-roombar-leave {
	flex-shrink: 0;
	border: none;
	border-radius: var(--ym-radius-size-s, 4px);
	padding: 4px 10px;
	font-size: 0.72rem;
	font-weight: 600;
	cursor: pointer;
	background: transparent;
	color: #e05c5c;
	transition: background-color 0.15s ease;
}
.nmc-la-panel-roombar-leave:hover {
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-create-room-btn {
	flex-shrink: 0;
	width: 100%;
	border: none;
	border-radius: var(--ym-radius-size-m, 8px);
	padding: 10px 16px;
	font-size: 0.85rem;
	font-weight: 700;
	cursor: pointer;
	background: #5865f2;
	color: #fff;
	transition: background-color 0.15s ease, opacity 0.15s ease;
}
.nmc-la-panel-create-room-btn:hover {
	background: #4752c4;
}
.nmc-la-panel-create-room-btn:disabled {
	opacity: 0.6;
	cursor: default;
}
.nmc-la-panel-room-list {
	flex-shrink: 0;
	padding: 0 16px 10px;
}
.nmc-la-panel-room-list-title {
	font-size: 0.7rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	opacity: 0.55;
	padding: 4px 0;
}
.nmc-la-panel-room-list-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.nmc-la-panel-room-list-item-name {
	flex: 1 1 auto;
	font-size: 0.82rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.nmc-la-panel-room-list-item-count {
	font-size: 0.72rem;
	opacity: 0.5;
	flex-shrink: 0;
}
.nmc-la-panel-room-list-item-join {
	flex-shrink: 0;
	border: none;
	border-radius: var(--ym-radius-size-m, 6px);
	padding: 4px 10px;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
	background: rgba(255, 255, 255, 0.1);
	color: #fff;
	transition: background-color 0.15s ease, opacity 0.15s ease;
}
.nmc-la-panel-room-list-item-join:hover {
	background: rgba(255, 255, 255, 0.18);
}
.nmc-la-panel-room-list-item-join:disabled {
	opacity: 0.6;
	cursor: default;
}
.nmc-la-panel-authgate {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	padding: 40px;
	text-align: center;
	color: var(--ym-controls-color-secondary-on_default-enabled);
}
.nmc-la-panel-authgate-text {
	font-size: 0.9rem;
	line-height: 1.6;
	max-width: 340px;
	opacity: 0.85;
}
.nmc-la-panel-authgate-link {
	color: #5865f2;
	font-weight: 600;
	cursor: pointer;
	text-decoration: underline;
}
.nmc-la-panel-dot {
	flex-shrink: 0;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	transition: background 0.4s ease;
}
.nmc-la-panel-dot.connecting {
	animation: nmLaPanelPulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes nmLaPanelPulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.35; }
}
.nmc-la-panel-roster-list {
	flex: 1 1 auto;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.nmc-la-panel-user {
	position: relative;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: var(--ym-radius-size-m, 8px);
	transition: background-color 0.2s ease;
}
.nmc-la-panel-user.host {
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-roster-divider {
	height: 1px;
	margin: 4px 8px;
	background: var(--ym-controls-color-secondary-default-hovered);
	opacity: 0.6;
}
.nmc-la-panel-avatar {
	flex-shrink: 0;
	width: 38px;
	height: 38px;
	border-radius: 50%;
	object-fit: cover;
}
.nmc-la-panel-user-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.85rem;
	font-weight: 600;
	transition: color 0.3s ease;
}
.nmc-la-panel-more-btn {
	margin-left: auto;
	flex-shrink: 0;
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: none;
	border-radius: var(--ym-radius-size-s, 4px);
	padding: 0;
	cursor: pointer;
	opacity: 0;
	background: transparent;
	color: inherit;
	transition: opacity 0.15s ease, background-color 0.2s ease;
}
.nmc-la-panel-user:hover .nmc-la-panel-more-btn,
.nmc-la-panel-more-btn.open {
	opacity: 0.7;
}
.nmc-la-panel-more-btn:hover {
	opacity: 1 !important;
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-menu {
	position: fixed;
	z-index: 2147483001;
	display: flex;
	flex-direction: column;
	min-width: 160px;
	padding: 4px;
	border-radius: var(--ym-radius-size-m, 8px);
	border: 0.0625rem solid var(--ym-outline-color-primary-disabled);
	background: var(--ym-background-color-primary-enabled-popover);
	box-shadow: 0 0.5rem 1.5rem var(--ym-shadow-menu);
	animation: nmLaPanelMsgIn 0.12s ease;
}
.nmc-la-panel-menu-item {
	display: flex;
	align-items: center;
	width: 100%;
	border: none;
	border-radius: var(--ym-radius-size-s, 4px);
	padding: 7px 10px;
	font-size: 0.8rem;
	font-weight: 500;
	text-align: left;
	cursor: pointer;
	background: transparent;
	color: inherit;
	transition: background-color 0.15s ease;
}
.nmc-la-panel-menu-item:hover {
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-menu-item.danger {
	color: #f04747;
}
.nmc-la-panel-chat {
	flex: 1 1 auto;
	padding: 10px;
}
.nmc-la-panel-chat-list {
	flex: 1 1 auto;
	overflow-y: auto;
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.nmc-la-panel-chat-msg {
	display: flex;
	gap: 10px;
	animation: nmLaPanelMsgIn 0.2s ease;
}
@keyframes nmLaPanelMsgIn {
	from { opacity: 0; transform: translateY(4px); }
	to { opacity: 1; transform: translateY(0); }
}
.nmc-la-panel-chat-msg .nmc-la-panel-avatar {
	margin-top: 2px;
}
.nmc-la-panel-chat-msg-body {
	min-width: 0;
	flex: 1 1 auto;
}
.nmc-la-panel-chat-msg-head {
	display: flex;
	align-items: baseline;
	gap: 8px;
}
.nmc-la-panel-chat-msg-head .who {
	font-size: 0.85rem;
	font-weight: 600;
	transition: color 0.3s ease;
}
.nmc-la-panel-chat-msg-head .time {
	font-size: 0.7rem;
	opacity: 0.5;
	flex-shrink: 0;
}
.nmc-la-panel-chat-msg-text {
	font-size: 0.85rem;
	line-height: 1.4;
	word-break: break-word;
}
.nmc-la-panel-chat-empty {
	opacity: 0.5;
	font-size: 0.85rem;
}
.nmc-la-panel-chat-input-row {
	display: flex;
	gap: 8px;
	margin-top: 12px;
}
.nmc-la-panel-chat-input {
	flex: 1 1 auto;
	min-width: 0;
	border-radius: var(--ym-radius-size-m, 8px);
	border: 1px solid var(--ym-controls-color-secondary-outline-enabled_stroke);
	background: var(--ym-controls-color-secondary-default-enabled);
	color: inherit;
	padding: 8px 10px;
	font-size: 0.85rem;
	outline: none;
	transition: border-color 0.2s ease;
}
.nmc-la-panel-chat-input:focus {
	border-color: var(--ym-controls-color-secondary-outline-selected_stroke);
}
.nmc-la-panel-chat-send {
	border-radius: var(--ym-radius-size-m, 8px);
	border: none;
	padding: 8px 14px;
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	background: var(--ym-controls-color-secondary-default-enabled);
	color: inherit;
	transition: background-color 0.2s ease;
}
.nmc-la-panel-chat-send:hover {
	background: var(--ym-controls-color-secondary-default-hovered);
}
.nmc-la-panel-chat-send:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.nmc-la-panel-track-widget {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 6px;
	padding: 8px;
	border-radius: var(--ym-radius-size-m, 8px);
	background: var(--ym-controls-color-secondary-default-enabled);
	max-width: 280px;
}
.nmc-la-panel-track-widget-cover {
	flex-shrink: 0;
	width: 40px;
	height: 40px;
	border-radius: var(--ym-radius-size-s, 4px);
	object-fit: cover;
}
.nmc-la-panel-track-widget-cover.skeleton {
	background: var(--ym-controls-color-primary-default-disabled);
}
.nmc-la-panel-track-widget-body {
	min-width: 0;
	flex: 1 1 auto;
}
.nmc-la-panel-track-widget-title {
	font-size: 0.8rem;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.nmc-la-panel-track-widget-artists {
	font-size: 0.75rem;
	opacity: 0.6;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.nmc-la-panel-track-widget-play {
	flex-shrink: 0;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	border: none;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--ym-controls-color-primary-default-enabled);
	color: var(--ym-controls-color-primary-on_default-enabled);
	cursor: pointer;
	transition: background-color 0.2s ease;
}
.nmc-la-panel-track-widget-play:hover {
	background: var(--ym-controls-color-primary-default-hovered);
}
.nmc-la-panel-scroll {
	transition: scrollbar-color 0.2s ease-in-out;
}
.nmc-la-panel-scroll::-webkit-scrollbar {
	width: var(--ym-spacer-size-m);
}
.nmc-la-panel-scroll::-webkit-scrollbar-thumb {
	background-clip: content-box;
	background-color: var(--ym-controls-color-primary-default-disabled);
	border: 0.1875rem solid transparent;
	border-radius: var(--ym-radius-size-l);
	min-height: 3.125rem;
}
.nmc-la-panel-scroll::-webkit-scrollbar-thumb:hover {
	background-color: var(--ym-surface-color-primary-enabled-entity);
}
`;

function laAvatarEl(h, a, size) {
	if (a.id === SERVER_AVATAR_ID) {
		const px = Number.parseFloat(size) || 38;
		return h(
			"div",
			{
				className: "nmc-la-panel-avatar",
				style: {
					width: size,
					height: size,
					background: "#000",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				},
			},
			h("img", {
				src: SERVER_AVATAR_URL,
				alt: "",
				style: {
					width: `${px * 0.8}px`,
					height: `${px * 0.8}px`,
					objectFit: "contain",
				},
			}),
		);
	}

	return a.url
		? h("img", {
				className: "nmc-la-panel-avatar",
				src: a.url,
				alt: "",
				style: {
					width: size,
					height: size,
				},
			})
		: h(
				"div",
				{
					className: "nmc-la-panel-avatar",
					style: {
						width: size,
						height: size,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						fontSize: "11px",
						fontWeight: 600,
						background:
							"var(--ym-controls-color-secondary-default-enabled)",
					},
				},
				(a.name || "?")[0].toUpperCase(),
			);
}

function formatChatTime(ts) {
	if (!ts) return "";
	const date = new Date(ts);
	const now = new Date();
	const time = date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const isSameDay = (a, b) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();

	if (isSameDay(date, now)) return `Today at ${time}`;

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDay(date, yesterday)) return `Yesterday at ${time}`;

	return `${date.toLocaleDateString()} at ${time}`;
}

function LaMoreIcon(h) {
	return h(
		"svg",
		{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor" },
		h("circle", { cx: 3, cy: 8, r: 1.5 }),
		h("circle", { cx: 8, cy: 8, r: 1.5 }),
		h("circle", { cx: 13, cy: 8, r: 1.5 }),
	);
}

function LaPanelUserMenu(props) {
	const { React, ReactDOMPortal, a, state, handlers, anchorEl, onCloseMenu } =
		props;
	const h = React.createElement;
	const [pos, setPos] = React.useState(null);

	React.useLayoutEffect(() => {
		if (!anchorEl) return;
		const rect = anchorEl.getBoundingClientRect();
		setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
	}, [anchorEl]);

	React.useEffect(() => {
		const onClick = () => onCloseMenu();
		const onKey = (event) => {
			if (event.key === "Escape") onCloseMenu();
		};
		window.addEventListener("click", onClick);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("click", onClick);
			window.removeEventListener("keydown", onKey);
		};
	}, [onCloseMenu]);

	const canMakeHost = state.isHost && !a.isHost && !a.isSelf;

	if (!pos) return null;

	return ReactDOMPortal.createPortal(
		h(
			"div",
			{
				className: "nmc-la-panel-menu",
				style: { top: `${pos.top}px`, right: `${pos.right}px` },
				onClick: (event) => event.stopPropagation(),
			},
			h(
				"button",
				{
					type: "button",
					className: "nmc-la-panel-menu-item",
					onClick: () => {
						onCloseMenu();
						handlers.onCopyUserId?.(a.id);
					},
				},
				"Copy UID",
			),
			canMakeHost
				? h(
						"button",
						{
							type: "button",
							className: "nmc-la-panel-menu-item",
							onClick: () => {
								onCloseMenu();
								handlers.onMakeHost?.(a.id);
							},
						},
						"Make host",
					)
				: null,
		),
		document.body,
	);
}

function LaPanelRoster(props) {
	const { React, ReactDOMPortal, state, handlers } = props;
	const h = React.createElement;
	const avatars = state.avatars ?? [];
	const [openMenuFor, setOpenMenuFor] = React.useState(null);
	const moreBtnRefs = React.useRef({});

	const rows = avatars.length
		? avatars.map((a, i) =>
				h(
					React.Fragment,
					{ key: a.id },
					i > 0 && avatars[i - 1].isHost && !a.isHost
						? h("div", { className: "nmc-la-panel-roster-divider" })
						: null,
					h(
						"div",
						{
							className: `nmc-la-panel-user${a.isHost ? " host" : ""}`,
						},
						laAvatarEl(
							h,
							{ ...a, hostColor: state.hostColor },
							"28px",
						),
						h(
							"span",
							{
								className: "nmc-la-panel-user-name",
								style: a.isHost
									? { color: state.hostColor }
									: undefined,
							},
							a.name,
						),
						h(
							"button",
							{
								ref: (el) => {
									moreBtnRefs.current[a.id] = el;
								},
								type: "button",
								className: `nmc-la-panel-more-btn${openMenuFor === a.id ? " open" : ""}`,
								title: "More",
								onClick: (event) => {
									event.stopPropagation();
									setOpenMenuFor((cur) =>
										cur === a.id ? null : a.id,
									);
								},
							},
							LaMoreIcon(h),
						),
						openMenuFor === a.id
							? h(LaPanelUserMenu, {
									React,
									ReactDOMPortal,
									a,
									state,
									handlers,
									anchorEl: moreBtnRefs.current[a.id],
									onCloseMenu: () => setOpenMenuFor(null),
								})
							: null,
					),
				),
			)
		: h("div", { className: "nmc-la-panel-chat-empty" }, "No one here yet");

	return h(
		"div",
		{ className: "nmc-la-panel-col nmc-la-panel-roster" },
		h(
			"div",
			{ className: "nmc-la-panel-roster-list nmc-la-panel-scroll" },
			rows,
		),
	);
}

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

function LaPanelChat(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;
	const listRef = React.useRef(null);
	const [draft, setDraft] = React.useState("");

	React.useEffect(() => {
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [state.chat]);

	const send = () => {
		const text = draft.trim();
		if (!text) return;
		handlers.onSend?.(text);
		setDraft("");
	};

	const messages = state.chat ?? [];
	const avatarsById = new Map((state.avatars ?? []).map((a) => [a.id, a]));

	return h(
		"div",
		{ className: "nmc-la-panel-col nmc-la-panel-chat" },
		h(
			"div",
			{
				className: "nmc-la-panel-chat-list nmc-la-panel-scroll",
				ref: listRef,
			},
			messages.length
				? messages.map((m, i) => {
						const author = avatarsById.get(m.discordUserId) ?? {
							id: m.discordUserId,
							name:
								m.discordUserId === SERVER_AVATAR_ID
									? "server"
									: m.discordUserId,
							url: null,
							isHost: false,
						};
						const link = parseTrackLink(m.text);
						return h(
							"div",
							{
								key: `${m.ts}-${i}`,
								className: "nmc-la-panel-chat-msg",
							},
							laAvatarEl(
								h,
								{ ...author, hostColor: state.hostColor },
								"32px",
							),
							h(
								"div",
								{ className: "nmc-la-panel-chat-msg-body" },
								h(
									"div",
									{ className: "nmc-la-panel-chat-msg-head" },
									h(
										"span",
										{
											className: "who",
											style: author.isHost
												? { color: state.hostColor }
												: undefined,
										},
										author.name,
									),
									h(
										"span",
										{ className: "time" },
										formatChatTime(m.ts),
									),
								),
								h(
									"div",
									{ className: "nmc-la-panel-chat-msg-text" },
									m.text,
								),
								link
									? h(LaTrackWidget, {
											React,
											link,
											isHost: !!state.isHost,
											onPlay: handlers.onPlayTrack,
											nowPlaying: state.nowPlaying,
										})
									: null,
							),
						);
					})
				: h(
						"div",
						{ className: "nmc-la-panel-chat-empty" },
						"No messages yet",
					),
		),
		h(
			"div",
			{ className: "nmc-la-panel-chat-input-row" },
			h("input", {
				className: "nmc-la-panel-chat-input",
				value: draft,
				placeholder: "Message",
				onChange: (e) => setDraft(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter") send();
				},
			}),
			h(
				"button",
				{
					className: "nmc-la-panel-chat-send",
					disabled: !draft.trim(),
					onClick: send,
				},
				"Send",
			),
		),
	);
}

function LaPanelCloseIcon(h) {
	return h(
		"svg",
		{
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 2.2,
			strokeLinecap: "round",
		},
		h("path", { d: "M3 3l10 10M13 3L3 13" }),
	);
}

function LaDiscordIcon(h, size = 13) {
	return h(
		"svg",
		{
			width: size,
			height: size,
			viewBox: "0 0 127.14 96.36",
			fill: "#fff",
		},
		h("path", {
			d: "M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z",
		}),
	);
}

function LaPanelRoomList(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;
	const [joining, setJoining] = React.useState(null);

	if (!state.connected) return null;
	const rooms = (state.roomList || []).filter(
		(room) => room.roomId !== state.roomId,
	);
	if (rooms.length === 0) return null;

	return h(
		"div",
		{ className: "nmc-la-panel-room-list" },
		h("div", { className: "nmc-la-panel-room-list-title" }, "Join a room"),
		rooms.map((room) =>
			h(
				"div",
				{ key: room.roomId, className: "nmc-la-panel-room-list-item" },
				h(
					"span",
					{ className: "nmc-la-panel-room-list-item-name" },
					room.roomName || room.roomId,
				),
				h(
					"span",
					{ className: "nmc-la-panel-room-list-item-count" },
					room.clientCount ?? "",
				),
				h(
					"button",
					{
						type: "button",
						className: "nmc-la-panel-room-list-item-join",
						disabled: joining === room.roomId,
						onClick: async () => {
							setJoining(room.roomId);
							await handlers.onJoinRoom?.(room.roomId);
							setJoining(null);
						},
					},
					joining === room.roomId ? "Joining…" : "Join",
				),
			),
		),
	);
}

function LaPanelRoomName(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState("");
	const [creating, setCreating] = React.useState(false);

	if (!state.connected) return null;

	if (!state.roomId) {
		return h(
			"div",
			{ className: "nmc-la-panel-room-name" },
			h(
				"button",
				{
					type: "button",
					className: "nmc-la-panel-create-room-btn",
					disabled: creating,
					onClick: async () => {
						setCreating(true);
						await handlers.onCreateRoom?.("");
						setCreating(false);
					},
				},
				creating ? "Creating…" : "Create Room",
			),
		);
	}

	const commit = () => {
		setEditing(false);
		const trimmed = draft.trim();
		if (trimmed !== (state.roomName || "")) {
			handlers.onSetRoomName?.(trimmed);
		}
	};

	if (!state.isCreator) {
		return h(
			"div",
			{ className: "nmc-la-panel-room-name" },
			h(
				"span",
				{ className: "nmc-la-panel-room-name-text" },
				state.roomName || state.roomId,
			),
		);
	}

	return h(
		"div",
		{ className: "nmc-la-panel-room-name" },
		editing
			? h("input", {
					className: "nmc-la-panel-room-name-input",
					autoFocus: true,
					value: draft,
					maxLength: 40,
					placeholder: "Room name",
					onChange: (e) => setDraft(e.target.value),
					onBlur: commit,
					onKeyDown: (e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							setDraft(state.roomName || "");
							setEditing(false);
						}
					},
				})
			: h(
					"span",
					{
						className: "nmc-la-panel-room-name-text",
						title: "Click to rename",
						onClick: () => {
							setDraft(state.roomName || "");
							setEditing(true);
						},
					},
					state.roomName || "Set a room name…",
				),
	);
}

function LaPanelSidebar(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;

	return h(
		"div",
		{ className: "nmc-la-panel-col nmc-la-panel-sidebar" },
		h(
			"div",
			{
				className: "nmc-la-panel-sidebar-status",
				title: state.connected
					? "Disconnect from server"
					: "Connect to server",
				onClick: () => handlers.onToggleConnect?.(),
			},
			h("span", {
				className: `nmc-la-panel-dot${state.dot === "connecting" ? " connecting" : ""}`,
				style: { background: state.color },
			}),
			h(
				"span",
				{ className: "nmc-la-panel-sidebar-status-text" },
				state.text,
			),
			state.serverVersion
				? h(
						"span",
						{ className: "nmc-la-panel-server-version" },
						state.serverVersion,
					)
				: null,
		),
		h(LaPanelRoomName, { key: "room-name", React, state, handlers }),
		h(LaPanelRoomList, { key: "room-list", React, state, handlers }),
	);
}

function LaPanelRoomBar(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;

	if (!state.connected || !state.roomId) return null;

	return [
		h(
			"span",
			{ key: "text", className: "nmc-la-panel-roombar-text" },
			"Connected to ",
			h("b", null, state.roomName || state.roomId),
		),
		h(
			"button",
			{
				key: "leave",
				type: "button",
				className: "nmc-la-panel-roombar-leave",
				onClick: () => handlers.onLeaveRoom?.(),
			},
			"Leave room",
		),
	];
}

function LaPanelAuthGate(props) {
	const { React, handlers } = props;
	const h = React.createElement;

	return h(
		"div",
		{ className: "nmc-la-panel-authgate" },
		LaDiscordIcon(h, 40),
		h(
			"div",
			{ className: "nmc-la-panel-authgate-text" },
			"Sign in with Discord in ",
			h(
				"a",
				{
					className: "nmc-la-panel-authgate-link",
					onClick: (event) => {
						event.preventDefault();
						handlers.onOpenSettings?.();
					},
				},
				"Settings",
			),
			", then come back.",
		),
	);
}

function LaPanel() {
	const { React, ReactDOMPortal } = getSiteComponents();
	const h = React.createElement;
	const state = _laPanelState;
	const handlers = _laPanelHandlers;

	React.useEffect(() => {
		const onKey = (event) => {
			if (event.key === "Escape") handlers.onClose?.();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [handlers]);

	return h(
		"div",
		{
			className: "nmc-la-panel-bg",
			onClick: (event) => {
				if (event.target === event.currentTarget) handlers.onClose?.();
			},
		},
		h(
			"div",
			{ className: "nmc-la-panel" },
			h(
				"div",
				{ className: "nmc-la-panel-header" },
				h(
					"div",
					{ className: "nmc-la-panel-title" },
					state.discordLinked
						? h(LaPanelRoomBar, {
								key: "roombar",
								React,
								state,
								handlers,
							})
						: null,
				),
				h(
					"button",
					{
						type: "button",
						className: "nmc-la-panel-close",
						title: "Close",
						onClick: () => handlers.onClose?.(),
					},
					LaPanelCloseIcon(h),
				),
			),
			state.discordLinked
				? h(
						"div",
						{ className: "nmc-la-panel-body" },
						h(LaPanelSidebar, {
							key: "sidebar",
							React,
							state,
							handlers,
						}),
						h(LaPanelChat, {
							key: "chat",
							React,
							state,
							handlers,
						}),
						h(LaPanelRoster, {
							key: "roster",
							React,
							ReactDOMPortal,
							state,
							handlers,
						}),
					)
				: h(LaPanelAuthGate, { React, handlers }),
		),
	);
}

function mountListenAlongPanel(state, handlers) {
	const { React, ReactDOMClient } = getSiteComponents();
	if (!React || !ReactDOMClient) return false;

	_laPanelState = state ?? {};
	_laPanelHandlers = handlers ?? {};

	if (!_laPanelHost) {
		_laPanelHost = document.createElement("div");
		_laPanelHost.id = "nm-la-panel-host";
		document.body.appendChild(_laPanelHost);
	}

	if (!_laPanelRoot) {
		_laPanelRoot = ReactDOMClient.createRoot(_laPanelHost);
	}
	_laPanelRoot.render(React.createElement(LaPanel));

	injectStyleTag("nm-la-panel-style", LA_PANEL_CSS);

	return true;
}

function updateListenAlongPanel(state) {
	if (!_laPanelRoot) return;
	_laPanelState = state ?? {};
	const { React } = getSiteComponents();
	_laPanelRoot.render(React.createElement(LaPanel));
}

function unmountListenAlongPanel() {
	if (_laPanelRoot) {
		_laPanelRoot.unmount();
		_laPanelRoot = null;
	}
	if (_laPanelHost) {
		_laPanelHost.remove();
		_laPanelHost = null;
	}
	removeStyleTag("nm-la-panel-style");
}
