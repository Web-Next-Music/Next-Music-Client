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

	return (
		<div className="nmc-la-panel-col nmc-la-panel-chat">
			<div
				className="nmc-la-panel-chat-list nmc-la-panel-scroll"
				ref={listRef}
			>
				{messages.length ? (
					messages.map((m, i) => {
						const author = avatarsById.get(m.discordUserId) ?? {
							id: m.discordUserId,
							name:
								m.discordUserId === SERVER_AVATAR_ID
									? state.text || "server"
									: m.discordUserId,
							url:
								m.discordUserId === SERVER_AVATAR_ID
									? state.serverCover || null
									: null,
							isHost: false,
						};
						const link = parseTrackLink(m.text);
						return (
							<div
								key={`${m.ts}-${i}`}
								className="nmc-la-panel-chat-msg"
							>
								{laAvatarEl(
									h,
									{ ...author, hostColor: state.hostColor },
									"32px",
								)}
								<div className="nmc-la-panel-chat-msg-body">
									<div className="nmc-la-panel-chat-msg-head">
										<span
											className="who"
											style={
												author.isHost
													? { color: state.hostColor }
													: undefined
											}
										>
											{author.name}
										</span>
										<span className="time">
											{formatChatTime(m.ts)}
										</span>
									</div>
									<div className="nmc-la-panel-chat-msg-text">
										{m.text}
									</div>
									{link ? (
										<LaTrackWidget
											React={React}
											link={link}
											isHost={!!state.isHost}
											onPlay={handlers.onPlayTrack}
											nowPlaying={state.nowPlaying}
										/>
									) : null}
								</div>
							</div>
						);
					})
				) : (
					<div className="nmc-la-panel-chat-empty">
						No messages yet
					</div>
				)}
			</div>
			<div className="nmc-la-panel-chat-input-row">
				<input
					className="nmc-la-panel-chat-input"
					value={draft}
					placeholder="Message"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") send();
					}}
				/>
				<button
					className="nmc-la-panel-chat-send"
					disabled={!draft.trim()}
					onClick={send}
				>
					Send
				</button>
			</div>
		</div>
	);
}
