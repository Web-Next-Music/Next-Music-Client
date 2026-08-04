let _shareRoot = null;
let _shareHost = null;
let _shareContainer = null;
let _shareAnchor = null;
let _shareBodyObserver = null;
let _shareRenderPending = false;
let _shareEnabled = false;

function findMetaContainer() {
	return document.querySelector(
		'[class*="PlayerBarDesktopWithBackgroundProgressBar_meta"]',
	);
}

function isShareButtonAttached() {
	return (
		!!_shareContainer &&
		_shareContainer.isConnected &&
		!!_shareContainer.querySelector("#ugc-share-btn")
	);
}

function readActionTemplate(container) {
	for (const btn of container.querySelectorAll("button")) {
		if (btn.id === "ugc-share-btn" || btn.disabled) continue;

		const iconWrap = btn.querySelector(":scope > span");
		if (!iconWrap) continue;

		return {
			buttonClassName: btn.className,
			iconWrapClassName: iconWrap.className,
		};
	}
	return null;
}

function createShareButton(React, template, iconSvg, onClick) {
	return function UgcShareButton() {
		return React.createElement(
			"button",
			{
				id: "ugc-share-btn",
				type: "button",
				className: template.buttonClassName,
				"aria-label": "Share track",
				onClick,
			},
			React.createElement("span", {
				className: template.iconWrapClassName,
				dangerouslySetInnerHTML: { __html: iconSvg },
			}),
		);
	};
}

function findInsertionReference(container) {
	return container.firstElementChild;
}

function renderShareButton(iconSvg, onClick) {
	const { React, ReactDOMClient, ReactDOMPortal } = getSiteComponents();
	if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

	const container = findMetaContainer();
	if (!container) return false;

	const template = readActionTemplate(container);
	if (!template) return false;

	cleanupShareButton();

	_shareHost = document.createElement("div");
	_shareHost.style.display = "none";
	document.body.appendChild(_shareHost);

	const anchor = document.createElement("span");
	anchor.style.display = "contents";
	const referenceNode = findInsertionReference(container);
	if (referenceNode) {
		container.insertBefore(anchor, referenceNode);
	} else {
		container.appendChild(anchor);
	}

	const UgcShareButton = createShareButton(React, template, iconSvg, onClick);

	_shareContainer = container;
	_shareAnchor = anchor;
	_shareRoot = ReactDOMClient.createRoot(_shareHost);
	_shareRoot.render(
		ReactDOMPortal.createPortal(React.createElement(UgcShareButton), anchor),
	);

	return true;
}

function scheduleShareRecheck(iconSvg, onClick) {
	if (_shareRenderPending) return;
	_shareRenderPending = true;
	requestAnimationFrame(() => {
		_shareRenderPending = false;
		if (_shareEnabled && !isShareButtonAttached()) {
			renderShareButton(iconSvg, onClick);
		}
	});
}

function mountUgcShareButton(iconSvg, onClick) {
	_shareEnabled = true;

	if (isShareButtonAttached()) return true;
	if (!renderShareButton(iconSvg, onClick)) return false;

	if (!_shareBodyObserver) {
		_shareBodyObserver = new MutationObserver(() =>
			scheduleShareRecheck(iconSvg, onClick),
		);
		_shareBodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	return true;
}

function cleanupShareButton() {
	if (_shareRoot) {
		_shareRoot.unmount();
		_shareRoot = null;
	}
	if (_shareHost) {
		_shareHost.remove();
		_shareHost = null;
	}
	if (_shareAnchor) {
		_shareAnchor.remove();
		_shareAnchor = null;
	}
	_shareContainer = null;
}

function unmountUgcShareButton() {
	_shareEnabled = false;
	cleanupShareButton();
}
