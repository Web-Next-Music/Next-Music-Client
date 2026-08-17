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
			state.serverCover
				? h(
						"span",
						{
							className: `nmc-la-panel-sidebar-avatar-ring${state.dot === "connecting" ? " connecting" : ""}`,
							style: { boxShadow: `0 0 0 2px ${state.color}` },
						},
						h("img", {
							className: "nmc-la-panel-sidebar-avatar",
							src: state.serverCover,
							alt: "",
						}),
					)
				: h("span", {
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
						"button",
						{
							type: "button",
							className: "nmc-la-panel-info-btn",
							title: "Server info",
							onClick: (event) => {
								event.stopPropagation();
								handlers.onOpenInfo?.();
							},
						},
						LaInfoIcon(h),
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
