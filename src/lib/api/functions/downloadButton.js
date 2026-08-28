let _dlRoot = null;
let _dlHost = null;
let _dlContainer = null;
let _dlAnchor = null;
let _dlTemplate = null;
let _dlBodyObserver = null;
let _dlRenderPending = false;
let _dlEnabled = false;
let _dlState = { phase: "idle" };
let _dlOnClick = null;

const DL_ICON = { variant: "download", size: "xxs" };

const DL_SPINNER_CSS = __CSS_FILE__("./styles/downloadSpinner.css");

function isDownloadButtonAttached() {
	return (
		!!_dlContainer &&
		_dlContainer.isConnected &&
		!!_dlContainer.querySelector("#nm-download-btn")
	);
}

function NmDownloadButton() {
	const { React } = getSiteComponents();
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

function renderDownloadPortal() {
	const { React, ReactDOMPortal } = getSiteComponents();
	return ReactDOMPortal.createPortal(
		React.createElement(NmDownloadButton),
		_dlAnchor,
	);
}

function renderDownloadButton() {
	const { React, ReactDOMClient, ReactDOMPortal } = getSiteComponents();
	if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

	const container = findMetaContainer();
	if (!container) return false;

	const template = readActionTemplate(container, "nm-download-btn");
	if (!template) return false;

	cleanupDownloadButton();

	_dlHost = document.createElement("div");
	_dlHost.style.display = "none";
	document.body.appendChild(_dlHost);

	const anchor = document.createElement("span");
	anchor.style.display = "contents";
	const settingsBtn = container.querySelector(
		'[class*="PlayerBarDesktopWithBackgroundProgressBar_settingsButton"]',
	);
	if (settingsBtn) {
		container.insertBefore(anchor, settingsBtn);
	} else {
		container.appendChild(anchor);
	}

	_dlContainer = container;
	_dlAnchor = anchor;
	_dlTemplate = template;
	_dlRoot = renderInSiteContext(renderDownloadPortal(), _dlHost, {
		onError: (err) => console.error("[downloadButton] render failed:", err),
	});

	injectStyleTag("nm-dl-spinner-style", DL_SPINNER_CSS);

	return !!_dlRoot;
}

function scheduleDownloadRecheck() {
	if (_dlRenderPending) return;
	_dlRenderPending = true;
	requestAnimationFrame(() => {
		_dlRenderPending = false;
		if (_dlEnabled && !isDownloadButtonAttached()) {
			renderDownloadButton();
		}
	});
}

function mountDownloadButton(renderState, onClick) {
	_dlEnabled = true;
	_dlState = renderState ?? { phase: "idle" };
	_dlOnClick = onClick;

	if (!_dlBodyObserver) {
		_dlBodyObserver = new MutationObserver(() => scheduleDownloadRecheck());
		_dlBodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	if (isDownloadButtonAttached()) {
		_dlRoot.render(renderDownloadPortal());
		return true;
	}

	return renderDownloadButton();
}

function updateDownloadButtonState(renderState) {
	_dlState = renderState ?? { phase: "idle" };
	if (!_dlRoot || !isDownloadButtonAttached()) return;
	_dlRoot.render(renderDownloadPortal());
}

function cleanupDownloadButton() {
	if (_dlRoot) {
		_dlRoot.unmount();
		_dlRoot = null;
	}
	if (_dlHost) {
		_dlHost.remove();
		_dlHost = null;
	}
	if (_dlAnchor) {
		_dlAnchor.remove();
		_dlAnchor = null;
	}
	_dlContainer = null;
	_dlTemplate = null;
}

function unmountDownloadButton() {
	_dlEnabled = false;
	cleanupDownloadButton();
	removeStyleTag("nm-dl-spinner-style");
}
