let _dlRoot = null;
let _dlHost = null;
let _dlContainer = null;
let _dlTemplate = null;
let _dlBodyObserver = null;
let _dlRenderPending = false;
let _dlEnabled = false;
let _dlState = { phase: "idle" };
let _dlOnClick = null;

const DL_ICON_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"
  aria-hidden="true" focusable="false" role="img" class="svg-icon">
  <use xlink:href="/icons/sprite.svg#download_xxs"/>
</svg>`;

const DL_SPINNER_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"
  aria-hidden="true" focusable="false" class="nm-dl-spinner">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-dasharray="42 14" />
</svg>`;

const DL_SPINNER_CSS = __CSS_FILE__("./styles/downloadSpinner.css");

function findSettingsButtonContainer() {
	const settingsBtn = document.querySelector(
		'[class*="PlayerBarDesktopWithBackgroundProgressBar_settingsButton"]',
	);
	return settingsBtn?.parentElement ?? null;
}

function isDownloadButtonAttached() {
	return (
		!!_dlContainer &&
		_dlContainer.isConnected &&
		!!_dlContainer.querySelector("#nm-download-btn")
	);
}

function readDownloadActionTemplate(container) {
	for (const btn of container.querySelectorAll("button")) {
		if (btn.id === "nm-download-btn" || btn.disabled) continue;

		const iconWrap = btn.querySelector(":scope > span");
		if (!iconWrap) continue;

		return {
			buttonClassName: btn.className,
			iconWrapClassName: iconWrap.className,
		};
	}
	return null;
}

function NmDownloadButton() {
	const { React } = getSiteComponents();
	const template = _dlTemplate;
	const state = _dlState;
	const disabled = state.phase !== "idle";

	const content =
		state.phase === "idle"
			? React.createElement("span", {
					className: template.iconWrapClassName,
					dangerouslySetInnerHTML: { __html: DL_ICON_SVG },
				})
			: React.createElement(
					React.Fragment,
					null,
					React.createElement("span", {
						className: template.iconWrapClassName,
						dangerouslySetInnerHTML: { __html: DL_SPINNER_SVG },
					}),
					React.createElement("div", { id: "nm-dl-progress-track" }),
					React.createElement("div", {
						id: "nm-dl-progress-fill",
						style: {
							width: `${Math.min((state.progress ?? 0) * 100, 100)}%`,
						},
					}),
				);

	return React.createElement(
		"button",
		{
			id: "nm-download-btn",
			type: "button",
			className: template.buttonClassName,
			"aria-label": "Download track",
			disabled,
			onClick: _dlOnClick,
		},
		content,
	);
}

function renderDownloadPortal() {
	const { React, ReactDOMPortal } = getSiteComponents();
	return ReactDOMPortal.createPortal(
		React.createElement(NmDownloadButton),
		_dlContainer,
	);
}

function renderDownloadButton() {
	const { React, ReactDOMClient, ReactDOMPortal } = getSiteComponents();
	if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

	const container = findSettingsButtonContainer();
	if (!container) return false;

	const template = readDownloadActionTemplate(container);
	if (!template) return false;

	cleanupDownloadButton();

	_dlHost = document.createElement("div");
	_dlHost.style.display = "none";
	document.body.appendChild(_dlHost);

	_dlContainer = container;
	_dlTemplate = template;
	_dlRoot = ReactDOMClient.createRoot(_dlHost);
	_dlRoot.render(renderDownloadPortal());

	injectStyleTag("nm-dl-spinner-style", DL_SPINNER_CSS);

	return true;
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

	if (isDownloadButtonAttached()) {
		_dlRoot.render(renderDownloadPortal());
		return true;
	}
	if (!renderDownloadButton()) return false;

	if (!_dlBodyObserver) {
		_dlBodyObserver = new MutationObserver(() => scheduleDownloadRecheck());
		_dlBodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	return true;
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
	_dlContainer = null;
	_dlTemplate = null;
}

function unmountDownloadButton() {
	_dlEnabled = false;
	cleanupDownloadButton();
	removeStyleTag("nm-dl-spinner-style");
}
