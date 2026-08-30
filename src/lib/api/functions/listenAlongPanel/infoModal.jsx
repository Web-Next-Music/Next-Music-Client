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

	let supportedClients;
	if (!hasRange) {
		supportedClients = (
			<span className="nmc-la-info-modal-empty">Any version</span>
		);
	} else if (tags === null && !tagsFailed) {
		supportedClients = (
			<span className="nmc-la-info-modal-empty">Loading…</span>
		);
	} else if (rangeTags.length === 0) {
		supportedClients = (
			<span className="nmc-la-info-modal-empty">
				{laVersionRangeText(
					state.minClientVersion,
					state.maxClientVersion,
				)}
			</span>
		);
	} else {
		supportedClients = (
			<div className="nmc-la-info-modal-tags">
				{rangeTags.map((tag) => (
					<span key={tag} className="nmc-la-info-modal-tag">
						{tag}
					</span>
				))}
			</div>
		);
	}

	return (
		<div
			className="nmc-la-info-modal-bg"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="nmc-la-info-modal">
				<div className="nmc-la-info-modal-head">
					<div className="nmc-la-info-modal-title">
						{state.text || "Server"}
					</div>
					<button
						type="button"
						className="nmc-la-info-modal-close"
						title="Close"
						onClick={onClose}
					>
						{LaPanelCloseIcon(h)}
					</button>
				</div>
				{state.serverDescription ? (
					<div className="nmc-la-info-modal-desc">
						{state.serverDescription}
					</div>
				) : null}
				<hr className="nmc-la-info-modal-divider" />
				<div className="nmc-la-info-modal-meta">
					<div className="nmc-la-info-modal-meta-row">
						<span className="nmc-la-info-modal-meta-label">
							Version
						</span>
						<span>{state.serverVersion || "—"}</span>
					</div>
					<div className="nmc-la-info-modal-meta-row">
						<span className="nmc-la-info-modal-meta-label">
							Supported clients
						</span>
						{supportedClients}
					</div>
				</div>
				{state.webPanelUrl ? (
					<button
						type="button"
						className="nmc-la-info-modal-webpanel-btn"
						onClick={() => openUrlExternal(state.webPanelUrl)}
					>
						Open web panel
					</button>
				) : null}
			</div>
		</div>
	);
}
