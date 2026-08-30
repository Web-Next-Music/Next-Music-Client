const DL_ICON = { variant: "download", size: "xxs" };
const DL_SPINNER_CSS = __CSS_FILE__("./styles/downloadSpinner.css");

let _dlState = { phase: "idle" };
let _dlOnClick = null;
let _dlTemplate = null;

function NmDownloadButton({ React }) {
	const { Button, buttonProps, Icon } = _dlTemplate;
	const state = _dlState;
	const busy = state.phase !== "idle";

	const button = React.createElement(Button, {
		...buttonProps,
		id: "nm-download-btn",
		"aria-label": "Download track",
		icon: React.createElement(Icon, DL_ICON),
		spinner: busy
			? React.createElement("span", { className: "nm-dl-spinner" })
			: undefined,
		onClick: _dlOnClick,
	});

	if (!busy) return button;

	return React.createElement(
		"span",
		{ id: "nm-dl-progress-wrap" },
		button,
		React.createElement("span", { id: "nm-dl-progress-track" }),
		React.createElement("span", {
			id: "nm-dl-progress-fill",
			style: {
				width: `${Math.min((state.progress ?? 0) * 100, 100)}%`,
			},
		}),
	);
}

const _dlFeature = createPortalFeature({
	id: "nm-dl-spinner",
	css: DL_SPINNER_CSS,
	findMount() {
		const container = findMetaContainer();
		if (!container) return null;
		const template = readActionTemplate(container, "nm-download-btn");
		if (!template) return null;
		_dlTemplate = template;
		return container;
	},
	isAttached(container) {
		return !!container.querySelector("#nm-download-btn");
	},
	placeAnchor({ mountEl, anchor }) {
		const settingsBtn = mountEl.querySelector(
			'[class*="PlayerBarDesktopWithBackgroundProgressBar_settingsButton"]',
		);
		if (settingsBtn) mountEl.insertBefore(anchor, settingsBtn);
		else mountEl.appendChild(anchor);
	},
	buildElement({ React }) {
		return React.createElement(NmDownloadButton, { React });
	},
	onError: (err) => console.error("[downloadButton] render failed:", err),
});

function mountDownloadButton(renderState, onClick) {
	_dlState = renderState ?? { phase: "idle" };
	_dlOnClick = onClick;
	return _dlFeature.mount();
}

function updateDownloadButtonState(renderState) {
	_dlState = renderState ?? { phase: "idle" };
	_dlFeature.refresh();
}

function unmountDownloadButton() {
	_dlFeature.unmount();
}
