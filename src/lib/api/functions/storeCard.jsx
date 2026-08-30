function createStoreButton(React) {
	return function StoreButton(props) {
		const {
			variant,
			icon,
			label,
			title,
			disabled,
			busy,
			iconOnly,
			onClick,
		} = props;

		const classes = ["btn"];
		if (variant) classes.push("btn-" + variant);
		if (iconOnly) classes.push("btn-icon");

		let content;
		if (busy) content = <span className="nmc-spin" />;
		else if (icon) content = storeIcon(React, icon);
		else content = label;

		return (
			<button
				type="button"
				className={classes.join(" ")}
				title={title || undefined}
				disabled={!!disabled || !!busy}
				onClick={onClick}
			>
				{content}
			</button>
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

function createStoreCard(React, StoreButton) {
	return function StoreCard(props) {
		const { item, section, hasUpdate, onAction, onReadme, onSettings } =
			props;

		const [logo, setLogo] = useCardLogo(React, item);
		const [busy, setBusy] = React.useState("");
		const [error, setError] = React.useState("");
		const [confirmDelete, setConfirmDelete] = React.useState(false);
		const hasSettings = useHasSettings(React, item);

		useAutoReset(React, confirmDelete, () => setConfirmDelete(false), 4000);
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

		const onDeleteClick = (event) => {
			if (!event?.isTrusted) return;
			if (!confirmDelete) {
				setConfirmDelete(true);
				return;
			}
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
					label={
						busy === "update" ? t("btnUpdating") : t("btnUpdate")
					}
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
						compactToggle
							? item.enabled
								? "disable"
								: "enable"
							: undefined
					}
					label={item.enabled ? t("btnDisable") : t("btnEnable")}
					title={
						item.enabled ? t("tooltipDisable") : t("tooltipEnable")
					}
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
					label={
						busy === "download"
							? t("btnDownloading")
							: t("btnDownload")
					}
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
					variant={confirmDelete ? "primary" : "danger"}
					iconOnly={!confirmDelete}
					icon={confirmDelete ? undefined : "trash"}
					label={confirmDelete ? t("btnDeleteConfirm") : undefined}
					title={t("tooltipDelete")}
					busy={busy === "delete"}
					disabled={!!busy}
					onClick={onDeleteClick}
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
				onClick={(event) => {
					event.preventDefault();
					openUrlExternal(
						"https://github.com/" + repo.owner + "/" + repo.repo,
					);
				}}
			>
				{repo.owner + " / " + repo.repo}
			</a>
		) : (
			<div className="nmc-sub">{cardSubtitleText(item, section)}</div>
		);

		const readmeIcon = item.readme
			? storeIcon(React, "readme", {
					title: t("tooltipReadme"),
					className: "nmc-readme-icon",
					onClick: () => onReadme(item),
				})
			: null;

		const cardClasses = ["nmc-card"];
		if (item.installed) cardClasses.push("installed");
		if (item.installed && !item.enabled) cardClasses.push("disabled");

		return (
			<div className={cardClasses.join(" ")}>
				<div className="nmc-card-top">
					{logoNode}
					<div className="nmc-meta">
						<div className="nmc-name">
							<span className="nmc-name-text">{item.name}</span>
							{readmeIcon}
						</div>
						{subtitle}
					</div>
				</div>
				<div className="nmc-actions">{buttons}</div>
			</div>
		);
	};
}
