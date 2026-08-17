function laParseVersion(v) {
	const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || ""));
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function laCompareVersions(a, b) {
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] - b[i];
	}
	return 0;
}

function laVersionInRange(tag, min, max) {
	const v = laParseVersion(tag);
	if (!v) return false;
	if (min) {
		const mv = laParseVersion(min);
		if (mv && laCompareVersions(v, mv) < 0) return false;
	}
	if (max) {
		const xv = laParseVersion(max);
		if (xv && laCompareVersions(v, xv) > 0) return false;
	}
	return true;
}

function laVersionRangeText(min, max) {
	if (min && max) return `${min} – ${max}`;
	if (min) return `${min}+`;
	if (max) return `up to ${max}`;
	return "";
}

function LaInfoModal(props) {
	const { React, state, onClose } = props;
	const h = React.createElement;
	const [tags, setTags] = React.useState(null);
	const [tagsFailed, setTagsFailed] = React.useState(false);

	React.useEffect(() => {
		const onKey = (event) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	React.useEffect(() => {
		let alive = true;
		if (!window.nmcStore?.request) {
			setTagsFailed(true);
			return;
		}
		window.nmcStore
			.request("GET", "/api/client-tags", {})
			.then((res) => {
				if (!alive) return;
				if (typeof res.body !== "string") throw new Error("bad body");
				const data = JSON.parse(res.body);
				if (!Array.isArray(data.tags)) throw new Error("bad tags");
				setTags(data.tags);
			})
			.catch(() => {
				if (alive) setTagsFailed(true);
			});
		return () => {
			alive = false;
		};
	}, []);

	const hasRange = !!(state.minClientVersion || state.maxClientVersion);
	const rangeTags = hasRange
		? (tags || []).filter((tag) =>
				laVersionInRange(
					tag,
					state.minClientVersion,
					state.maxClientVersion,
				),
			)
		: [];

	return h(
		"div",
		{
			className: "nmc-la-info-modal-bg",
			onClick: (event) => {
				if (event.target === event.currentTarget) onClose();
			},
		},
		h(
			"div",
			{ className: "nmc-la-info-modal" },
			h(
				"div",
				{ className: "nmc-la-info-modal-head" },
				h(
					"div",
					{ className: "nmc-la-info-modal-title" },
					state.text || "Server",
				),
				h(
					"button",
					{
						type: "button",
						className: "nmc-la-info-modal-close",
						title: "Close",
						onClick: onClose,
					},
					LaPanelCloseIcon(h),
				),
			),
			state.serverDescription
				? h(
						"div",
						{ className: "nmc-la-info-modal-desc" },
						state.serverDescription,
					)
				: null,
			h("hr", { className: "nmc-la-info-modal-divider" }),
			h(
				"div",
				{ className: "nmc-la-info-modal-meta" },
				h(
					"div",
					{ className: "nmc-la-info-modal-meta-row" },
					h(
						"span",
						{ className: "nmc-la-info-modal-meta-label" },
						"Version",
					),
					h("span", null, state.serverVersion || "—"),
				),
				h(
					"div",
					{ className: "nmc-la-info-modal-meta-row" },
					h(
						"span",
						{ className: "nmc-la-info-modal-meta-label" },
						"Supported clients",
					),
					!hasRange
						? h(
								"span",
								{ className: "nmc-la-info-modal-empty" },
								"Any version",
							)
						: tags === null && !tagsFailed
							? h(
									"span",
									{ className: "nmc-la-info-modal-empty" },
									"Loading…",
								)
							: rangeTags.length === 0
								? h(
										"span",
										{
											className:
												"nmc-la-info-modal-empty",
										},
										laVersionRangeText(
											state.minClientVersion,
											state.maxClientVersion,
										),
									)
								: h(
										"div",
										{ className: "nmc-la-info-modal-tags" },
										rangeTags.map((tag) =>
											h(
												"span",
												{
													key: tag,
													className:
														"nmc-la-info-modal-tag",
												},
												tag,
											),
										),
									),
				),
			),
			state.webPanelUrl
				? h(
						"button",
						{
							type: "button",
							className: "nmc-la-info-modal-webpanel-btn",
							onClick: () => openUrlExternal(state.webPanelUrl),
						},
						"Open web panel",
					)
				: null,
		),
	);
}
