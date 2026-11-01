function onReadmeLinkClick(event) {
	const link = event.target.closest?.("a[href]");
	if (!link) return;

	const href = link.getAttribute("href");
	event.preventDefault();

	if (href?.startsWith("#")) {
		const id = decodeURIComponent(href.slice(1));
		const target =
			event.currentTarget.querySelector(`[id="${CSS.escape(id)}"]`) ||
			event.currentTarget.querySelector(`[name="${CSS.escape(id)}"]`);
		target?.scrollIntoView({ behavior: "smooth", block: "start" });
		return;
	}

	if (href && /^https?:/i.test(href)) openUrlExternal(href);
}

function createReadmeModal(React) {
	const h = React.createElement;

	return function ReadmeModal({ item, onClose }) {
		const [html, setHtml] = React.useState(null);
		const { Modal, Heading } = getSiteComponents();
		const title = t("modalReadmeTitle", { name: item.name });
		const { open, close } = useStoreModal(React, onClose);

		React.useEffect(() => {
			if (Modal) return undefined;
			const onKey = (event) => {
				if (event.key === "Escape") close();
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [Modal, onClose]);

		React.useEffect(() => {
			let alive = true;
			ensureMarkdownCss()
				.then(() => fetchReadmeHtml(item))
				.then((content) => {
					if (!alive) return;
					if (!content)
						window.nextmusicApi.showErrorToast(t("statusFailedReadme"));
					setHtml(content || t("statusFailedReadme"));
				})
				.catch(() => {
					if (!alive) return;
					window.nextmusicApi.showErrorToast(t("statusFailedReadme"));
					setHtml(t("statusFailedReadme"));
				});
			return () => {
				alive = false;
			};
		}, [item.name]);

		const body =
			html === null
				? h("div", { className: "nmc-empty" }, t("statusLoading"))
				: h("div", {
						className: "markdown-body nmc-readme",
						onClick: onReadmeLinkClick,
						dangerouslySetInnerHTML: { __html: html },
					});
		const heading = h(
			"div",
			{ className: "nmc-readme-heading" },
			Heading
				? h(
						Heading,
						{
							className: "nmc-settings-heading",
							variant: "h4",
							size: "xs",
							weight: "bold",
						},
						title,
					)
				: h("h2", { className: "nmc-settings-heading" }, title),
			h("div", { className: "nmc-modal-badge" }, "README"),
		);
		const content = h(
			"div",
			{ className: "nmc-modal nmc-settings-modal nmc-readme-modal" },
			!Modal &&
				h(
					"div",
					{ className: "nmc-modal-head" },
					heading,
					h(
						"button",
						{
							type: "button",
							className: "nmc-settings-close",
							"aria-label": t("tooltipClose"),
							onClick: () => close(),
						},
						storeIcon(React, "close") || "×",
					),
				),
			h("div", { className: "nmc-modal-body nmc-scroll" }, body),
		);
		if (Modal)
			return h(
				Modal,
				{
					open,
					onClose: () => close(),
					onOpenChange: (open) => {
						if (!open) close();
					},
					header: heading,
					labelClose: t("tooltipClose"),
					placement: "center",
					overlayColor: "full",
					className: "nmc-native-modal",
					headerClassName: "nmc-native-modal-header",
					contentClassName: "nmc-native-modal-content",
					"aria-label": title,
				},
				content,
			);
		return h(
			"div",
			{
				className: "nmc-modal-bg",
				"data-open": open,
				onClick: (event) => {
					if (event.target === event.currentTarget) close();
				},
			},
			h(
				"div",
				{
					className: "nmc-readme-dialog",
					role: "dialog",
					"aria-modal": true,
					"aria-label": title,
				},
				content,
			),
		);
	};
}
