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
