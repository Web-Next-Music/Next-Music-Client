function LaRoomListCover(props) {
	const { React, trackId } = props;
	const isUgc = !!trackId && UGC_TRACK_ID_RE.test(trackId);
	const [meta, setMeta] = React.useState(undefined);

	React.useEffect(() => {
		if (!trackId || isUgc) return;
		let cancelled = false;
		fetchLinkMeta({ type: "track", id: trackId }).then((result) => {
			if (!cancelled) setMeta(result);
		});
		return () => {
			cancelled = true;
		};
	}, [trackId, isUgc]);

	if (!trackId || isUgc) return null;
	if (meta !== undefined && !meta?.coverUrl) return null;

	return (
		<img
			className={`nmc-la-panel-room-list-item-cover${meta?.coverUrl ? "" : " skeleton"}`}
			src={meta?.coverUrl || undefined}
			alt=""
		/>
	);
}

function LaPanelRoomList(props) {
	const { React, state, handlers } = props;
	const [joining, setJoining] = React.useState(null);

	if (!state.connected) return null;
	const rooms = (state.roomList || []).filter(
		(room) => room.roomId !== state.roomId,
	);
	if (rooms.length === 0) return null;

	return (
		<div className="nmc-la-panel-room-list">
			<div className="nmc-la-panel-room-list-title">Join a room</div>
			{rooms.map((room) => (
				<div key={room.roomId} className="nmc-la-panel-room-list-item">
					<LaRoomListCover
						key="cover"
						React={React}
						trackId={room.trackId}
					/>
					<span className="nmc-la-panel-room-list-item-name">
						{room.roomName || room.roomId}
					</span>
					<span className="nmc-la-panel-room-list-item-count">
						{room.clientCount ?? ""}
					</span>
					<button
						type="button"
						className="nmc-la-panel-room-list-item-join"
						disabled={joining === room.roomId}
						onClick={async () => {
							setJoining(room.roomId);
							await handlers.onJoinRoom?.(room.roomId);
							setJoining(null);
						}}
					>
						{joining === room.roomId ? "Joining…" : "Join"}
					</button>
				</div>
			))}
		</div>
	);
}

function LaPanelRoomName(props) {
	const { React, state, handlers } = props;
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState("");
	const [creating, setCreating] = React.useState(false);

	if (!state.connected) return null;

	if (!state.roomId) {
		return (
			<div className="nmc-la-panel-room-name">
				<button
					type="button"
					className="nmc-la-panel-create-room-btn"
					disabled={creating}
					onClick={async () => {
						setCreating(true);
						await handlers.onCreateRoom?.("");
						setCreating(false);
					}}
				>
					{creating ? "Creating…" : "Create Room"}
				</button>
			</div>
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
		return (
			<div className="nmc-la-panel-room-name">
				<LaRoomListCover
					key="cover"
					React={React}
					trackId={state.nowPlaying?.id}
				/>
				<span className="nmc-la-panel-room-name-text">
					{state.roomName || state.roomId}
				</span>
			</div>
		);
	}

	return (
		<div className="nmc-la-panel-room-name">
			{editing ? null : (
				<LaRoomListCover
					key="cover"
					React={React}
					trackId={state.nowPlaying?.id}
				/>
			)}
			{editing ? (
				<input
					className="nmc-la-panel-room-name-input"
					autoFocus={true}
					value={draft}
					maxLength={40}
					placeholder="Room name"
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") {
							setDraft(state.roomName || "");
							setEditing(false);
						}
					}}
				/>
			) : (
				<span
					className="nmc-la-panel-room-name-text"
					title="Click to rename"
					onClick={() => {
						setDraft(state.roomName || "");
						setEditing(true);
					}}
				>
					{state.roomName || "Set a room name…"}
				</span>
			)}
		</div>
	);
}

const LA_NOTIFY_VOLUME_KEY = "nmc-la-notify-volume";

function readChatNotifyVolume() {
	const raw = Number.parseFloat(localStorage.getItem(LA_NOTIFY_VOLUME_KEY));
	return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
}

function LaPanelNotifyVolume(props) {
	const { React, state } = props;
	const h = React.createElement;
	const [volume, setVolume] = React.useState(readChatNotifyVolume);

	if (!state.connected) return null;

	return (
		<div className="nmc-la-panel-notify-volume">
			<span className="nmc-la-panel-notify-volume-icon">
				{LaVolumeIcon(h, volume === 0)}
			</span>
			<input
				className="nmc-la-panel-notify-volume-slider"
				type="range"
				min={0}
				max={1}
				step={0.01}
				value={volume}
				title="Notification volume"
				onChange={(e) => {
					const next = Number.parseFloat(e.target.value);
					setVolume(next);
					localStorage.setItem(LA_NOTIFY_VOLUME_KEY, String(next));
				}}
			/>
		</div>
	);
}

function LaPanelSidebar(props) {
	const { React, state, handlers } = props;
	const h = React.createElement;

	return (
		<div className="nmc-la-panel-col nmc-la-panel-sidebar">
			<div
				className="nmc-la-panel-sidebar-status"
				title={
					state.connected
						? "Disconnect from server"
						: "Connect to server"
				}
				onClick={() => handlers.onToggleConnect?.()}
			>
				{state.serverCover ? (
					<span
						className={`nmc-la-panel-sidebar-avatar-ring${state.dot === "connecting" ? " connecting" : ""}`}
						style={{ boxShadow: `0 0 0 2px ${state.color}` }}
					>
						<img
							className="nmc-la-panel-sidebar-avatar"
							src={state.serverCover}
							alt=""
						/>
					</span>
				) : (
					<span
						className={`nmc-la-panel-dot${state.dot === "connecting" ? " connecting" : ""}`}
						style={{ background: state.color }}
					/>
				)}
				<span className="nmc-la-panel-sidebar-status-text">
					{state.text}
				</span>
				{state.serverVersion ? (
					<button
						type="button"
						className="nmc-la-panel-info-btn"
						title="Server info"
						onClick={(event) => {
							event.stopPropagation();
							handlers.onOpenInfo?.();
						}}
					>
						{LaInfoIcon(h)}
					</button>
				) : null}
			</div>
			<LaPanelRoomName
				key="room-name"
				React={React}
				state={state}
				handlers={handlers}
			/>
			<LaPanelRoomList
				key="room-list"
				React={React}
				state={state}
				handlers={handlers}
			/>
			<LaPanelNotifyVolume
				key="notify-volume"
				React={React}
				state={state}
				handlers={handlers}
			/>
		</div>
	);
}

function LaPanelRoomBar(props) {
	const { React, state, handlers } = props;

	if (!state.connected || !state.roomId) return null;

	return [
		<span key="text" className="nmc-la-panel-roombar-text">
			Connected to <b>{state.roomName || state.roomId}</b>
		</span>,
		<button
			key="leave"
			type="button"
			className="nmc-la-panel-roombar-leave"
			onClick={() => handlers.onLeaveRoom?.()}
		>
			Leave room
		</button>,
	];
}
