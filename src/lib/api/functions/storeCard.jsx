function createStoreButton(React) {
	return function StoreButton(props) {
		const { variant, icon, label, title, disabled, busy, iconOnly, onClick } =
			props;
		const { Button } = getSiteComponents();
		const iconNode = icon ? storeIcon(React, icon) : null;
		const classes = ["btn"];
		if (variant) classes.push("btn-" + variant);
		if (iconOnly && iconNode) classes.push("btn-icon");

		const content = busy ? (
			<span className="nmc-spin" aria-hidden="true" />
		) : (
			iconNode || label || title
		);
		const Component = Button || "button";
		return (
			<Component
				type="button"
				className={classes.join(" ")}
				title={title || undefined}
				aria-label={label || title || undefined}
				aria-busy={!!busy}
				disabled={!!disabled || !!busy}
				onClick={onClick}
			>
				{content}
			</Component>
		);
	};
}

function placeholderIconFor(item, section) {
	if (item.isLocal) return item.isDir === false ? "file" : "folder";
	return section === "themes" ? "theme" : "addon";
}

function cardSubtitleText(item, section) {
	if (item.isLocal) {
		return item.isDir === false ? t("cardFileLocal") : t("cardFolderLocal");
	}
	return section === "themes" ? t("sectionThemes") : t("sectionAddons");
}

function useAutoReset(React, value, reset, delay) {
	React.useEffect(() => {
		if (!value) return undefined;
		const timer = setTimeout(reset, delay);
		return () => clearTimeout(timer);
	}, [value]);
}

function useCardLogo(React, item) {
	const [logo, setLogo] = React.useState(null);

	React.useEffect(() => {
		let alive = true;
		loadLogoUrl(item)
			.then((url) => alive && url && setLogo(url))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [item.logo]);

	return [logo, setLogo];
}

function useHasSettings(React, item) {
	const [hasSettings, setHasSettings] = React.useState(false);

	React.useEffect(() => {
		if (!item.installed) return undefined;
		let alive = true;
		storeJson("GET", "/api/check-handle-events", { name: item.name })
			.then((res) => alive && setHasSettings(!!res.exists))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [item.installed, item.name]);

	return hasSettings;
}

function createDeleteModal(React, StoreButton) {
	return function DeleteModal({ item, onClose, onConfirm }) {
		const { Modal, Heading, Text } = getSiteComponents();
		const title = t("confirmDeleteTitle");
		React.useEffect(() => {
			if (Modal) return undefined;
			const onKey = (event) => {
				if (event.key === "Escape") onClose();
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [Modal, onClose]);

		const heading = Heading ? (
			<Heading
				className="nmc-settings-heading"
				variant="h4"
				size="xs"
				weight="bold"
			>
				{title}
			</Heading>
		) : (
			<h2 className="nmc-settings-heading">{title}</h2>
		);
		const message = t("confirmDeleteMessage", { name: item.name });
		const content = (
			<div className="nmc-modal nmc-settings-modal nmc-delete-modal">
				{!Modal && (
					<div className="nmc-modal-head">
						{heading}
						<button
							type="button"
							className="nmc-settings-close"
							aria-label={t("tooltipClose")}
							onClick={onClose}
						>
							{storeIcon(React, "close") || "×"}
						</button>
					</div>
				)}
				<div className="nmc-modal-body">
					{Text ? (
						<Text variant="span" size="m">
							{message}
						</Text>
					) : (
						message
					)}
				</div>
				<div className="nmc-modal-foot">
					<StoreButton
						variant="primary"
						label={t("btnDelete")}
						onClick={onConfirm}
					/>
				</div>
			</div>
		);
		if (Modal)
			return (
				<Modal
					open={true}
					onClose={onClose}
					onOpenChange={(open) => {
						if (!open) onClose();
					}}
					header={heading}
					labelClose={t("tooltipClose")}
					placement="center"
					overlayColor="full"
					className="nmc-native-modal nmc-delete-dialog"
					headerClassName="nmc-native-modal-header"
					contentClassName="nmc-native-modal-content"
					aria-label={title}
				>
					{content}
				</Modal>
			);
		return (
			<div
				className="nmc-modal-bg"
				onClick={(event) => {
					if (event.target === event.currentTarget) onClose();
				}}
			>
				<div role="dialog" aria-modal="true" aria-label={title}>
					{content}
				</div>
			</div>
		);
	};
}

function createStoreCard(React, StoreButton) {
	const DeleteModal = createDeleteModal(React, StoreButton);
	return function StoreCard(props) {
		const { item, section, hasUpdate, onAction, onReadme, onSettings } = props;
		const { Text } = getSiteComponents();
		const Name = Text || "span";

		const [logo, setLogo] = useCardLogo(React, item);
		const [busy, setBusy] = React.useState("");
		const [error, setError] = React.useState("");
		const [confirmDelete, setConfirmDelete] = React.useState(false);
		const hasSettings = useHasSettings(React, item);

		useAutoReset(React, error, () => setError(""), 3000);

		const run = async (action) => {
			setBusy(action);
			try {
				await onAction(action, item);
			} catch (err) {
				setError(err?.message || t("statusError"));
			}
			setBusy("");
		};

		const onDeleteConfirm = (event) => {
			if (!event?.isTrusted) return;
			setConfirmDelete(false);
			run("delete");
		};

		const compactToggle = !!hasUpdate;
		const buttons = [];

		if (hasUpdate) {
			buttons.push(
				<StoreButton
					key="update"
					variant="primary"
					label={busy === "update" ? t("btnUpdating") : t("btnUpdate")}
					busy={busy === "update"}
					disabled={!!busy}
					onClick={() => run("update")}
				/>,
			);
		}

		if (item.installed) {
			buttons.push(
				<StoreButton
					key="toggle"
					variant={item.enabled ? "on" : "off"}
					iconOnly={compactToggle}
					icon={
						compactToggle ? (item.enabled ? "disable" : "enable") : undefined
					}
					label={item.enabled ? t("btnDisable") : t("btnEnable")}
					title={item.enabled ? t("tooltipDisable") : t("tooltipEnable")}
					busy={busy === "toggle"}
					disabled={!!busy}
					onClick={() => run("toggle")}
				/>,
			);
		} else {
			buttons.push(
				<StoreButton
					key="download"
					variant="primary"
					label={busy === "download" ? t("btnDownloading") : t("btnDownload")}
					busy={busy === "download"}
					disabled={!!busy}
					onClick={() => run("download")}
				/>,
			);
		}

		if (hasSettings) {
			buttons.push(
				<StoreButton
					key="settings"
					variant="settings"
					iconOnly={true}
					icon="settings"
					title={t("tooltipSettings")}
					disabled={!!busy}
					onClick={() => onSettings(item)}
				/>,
			);
		}

		if (item.installed) {
			buttons.push(
				<StoreButton
					key="delete"
					variant="danger"
					iconOnly={true}
					icon="trash"
					title={t("tooltipDelete")}
					busy={busy === "delete"}
					disabled={!!busy}
					onClick={() => setConfirmDelete(true)}
				/>,
			);
		}

		if (error) {
			buttons.push(
				<div key="err" className="nmc-sb" title={error}>
					{error}
				</div>,
			);
		}

		const logoNode = logo ? (
			<img
				className="nmc-logo"
				src={logo}
				alt=""
				onError={() => setLogo(null)}
			/>
		) : (
			<div className={item.isLocal ? "nmc-logo-ph local" : "nmc-logo-ph"}>
				{storeIcon(React, placeholderIconFor(item, section))}
			</div>
		);

		const repo = item.submodule ? parseGithubRepo(item.subUrl) : null;

		const subtitle = repo ? (
			<a
				className="nmc-sub"
				href={"https://github.com/" + repo.owner + "/" + repo.repo}
				onClick={(event) => {
					event.preventDefault();
					openUrlExternal("https://github.com/" + repo.owner + "/" + repo.repo);
				}}
			>
				{repo.owner + " / " + repo.repo}
			</a>
		) : (
			<div className="nmc-sub">{cardSubtitleText(item, section)}</div>
		);

		const cardClasses = ["nmc-card"];
		if (item.readme) cardClasses.push("has-readme");
		if (item.installed) cardClasses.push("installed");
		if (item.installed && !item.enabled) cardClasses.push("disabled");

		return (
			<div
				className={cardClasses.join(" ")}
				tabIndex={item.readme ? 0 : undefined}
				aria-label={
					item.readme ? `${item.name}: ${t("tooltipReadme")}` : undefined
				}
				onClick={(event) => {
					if (
						item.readme &&
						event.target.matches(
							".nmc-card, .nmc-card-top, .nmc-meta, .nmc-name, .nmc-actions",
						)
					)
						onReadme(item);
				}}
				onKeyDown={(event) => {
					if (
						item.readme &&
						event.target === event.currentTarget &&
						(event.key === "Enter" || event.key === " ")
					) {
						event.preventDefault();
						onReadme(item);
					}
				}}
			>
				<div className="nmc-card-top">
					{logoNode}
					<div className="nmc-meta">
						<div className="nmc-name">
							<Name
								className="nmc-name-text"
								{...(Text ? { variant: "span", size: "m" } : {})}
							>
								{item.name}
							</Name>
							{item.readme &&
								storeIcon(React, "info", { className: "nmc-readme-info" })}
						</div>
						{subtitle}
					</div>
				</div>
				<div className="nmc-actions">{buttons}</div>
				{confirmDelete && (
					<DeleteModal
						item={item}
						onClose={() => setConfirmDelete(false)}
						onConfirm={onDeleteConfirm}
					/>
				)}
			</div>
		);
	};
}
