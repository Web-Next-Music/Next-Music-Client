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

function createReadmeModal(React, StoreButton) {
	const h = React.createElement;

	return function ReadmeModal({ item, onClose }) {
		const [html, setHtml] = React.useState(null);

		React.useEffect(() => {
			const onKey = (event) => {
				if (event.key === "Escape") onClose();
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [onClose]);

		React.useEffect(() => {
			let alive = true;
			ensureMarkdownCss()
				.then(() => fetchReadmeHtml(item))
				.then((content) => {
					if (alive) setHtml(content || t("statusFailedReadme"));
				})
				.catch(() => {
					if (alive) setHtml(t("statusFailedReadme"));
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

		return h(
			"div",
			{
				className: "nmc-modal-bg",
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
			},
			h(
				"div",
				{ className: "nmc-modal" },
				h(
					"div",
					{ className: "nmc-modal-head" },
					h(
						"div",
						{ className: "nmc-modal-title" },
						t("modalReadmeTitle", { name: item.name }),
					),
					h("div", { className: "nmc-modal-badge" }, "README"),
				),
				h("div", { className: "nmc-modal-body nmc-scroll" }, body),
				h(
					"div",
					{ className: "nmc-modal-foot" },
					h("div", { className: "nmc-modal-status" }, ""),
					h(StoreButton, {
						variant: "primary",
						label: t("tooltipClose"),
						onClick: onClose,
					}),
				),
			),
		);
	};
}
