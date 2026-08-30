function laAvatarEl(h, a, size) {
	if (a.id === SERVER_AVATAR_ID) {
		if (a.url) {
			return h("img", {
				className: "nmc-la-panel-avatar",
				src: a.url,
				alt: "",
				style: {
					width: size,
					height: size,
				},
			});
		}
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

function LaPanelUserMenu(props) {
	const { React, ReactDOMPortal, a, state, handlers, anchorEl, onCloseMenu } =
		props;
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
		<div
			className="nmc-la-panel-menu"
			style={{ top: `${pos.top}px`, right: `${pos.right}px` }}
			onClick={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				className="nmc-la-panel-menu-item"
				onClick={() => {
					onCloseMenu();
					handlers.onCopyUserId?.(a.id);
				}}
			>
				Copy UID
			</button>
			{canMakeHost ? (
				<button
					type="button"
					className="nmc-la-panel-menu-item"
					onClick={() => {
						onCloseMenu();
						handlers.onMakeHost?.(a.id);
					}}
				>
					Make host
				</button>
			) : null}
		</div>,
		document.body,
	);
}

function LaPanelRoster(props) {
	const { React, ReactDOMPortal, state, handlers } = props;
	const h = React.createElement;
	const avatars = state.roomId ? (state.avatars ?? []) : [];
	const [openMenuFor, setOpenMenuFor] = React.useState(null);
	const moreBtnRefs = React.useRef({});

	const rows = avatars.length ? (
		avatars.map((a, i) => (
			<React.Fragment key={a.id}>
				{i > 0 && avatars[i - 1].isHost && !a.isHost ? (
					<div className="nmc-la-panel-roster-divider" />
				) : null}
				<div className={`nmc-la-panel-user${a.isHost ? " host" : ""}`}>
					{laAvatarEl(
						h,
						{ ...a, hostColor: state.hostColor },
						"28px",
					)}
					<span
						className="nmc-la-panel-user-name"
						style={
							a.isHost ? { color: state.hostColor } : undefined
						}
					>
						{a.name}
					</span>
					<button
						ref={(el) => {
							moreBtnRefs.current[a.id] = el;
						}}
						type="button"
						className={`nmc-la-panel-more-btn${openMenuFor === a.id ? " open" : ""}`}
						title="More"
						onClick={(event) => {
							event.stopPropagation();
							setOpenMenuFor((cur) =>
								cur === a.id ? null : a.id,
							);
						}}
					>
						{LaMoreIcon(h)}
					</button>
					{openMenuFor === a.id ? (
						<LaPanelUserMenu
							React={React}
							ReactDOMPortal={ReactDOMPortal}
							a={a}
							state={state}
							handlers={handlers}
							anchorEl={moreBtnRefs.current[a.id]}
							onCloseMenu={() => setOpenMenuFor(null)}
						/>
					) : null}
				</div>
			</React.Fragment>
		))
	) : (
		<div className="nmc-la-panel-chat-empty">No one here yet</div>
	);

	return (
		<div className="nmc-la-panel-col nmc-la-panel-roster">
			<div className="nmc-la-panel-roster-count">
				{LaPeopleIcon(h)}
				{avatars.length}
			</div>
			<div className="nmc-la-panel-roster-list nmc-la-panel-scroll">
				{rows}
			</div>
		</div>
	);
}
