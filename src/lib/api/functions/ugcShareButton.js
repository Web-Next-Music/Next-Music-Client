let _shareRoot = null;
let _shareHost = null;
let _shareContainer = null;
let _shareAnchor = null;
let _shareBodyObserver = null;
let _shareRenderPending = false;
let _shareEnabled = false;

function isShareButtonAttached() {
	return (
		!!_shareContainer &&
		_shareContainer.isConnected &&
		!!_shareContainer.querySelector("#ugc-share-btn")
	);
}

function createShareButton(React, template, icon, onClick) {
	return function UgcShareButton() {
		return React.createElement(template.Button, {
			...template.buttonProps,
			id: "ugc-share-btn",
			"aria-label": "Share track",
			icon: React.createElement(template.Icon, icon),
			onClick,
		});
	};
}

function findInsertionReference(container) {
	return container.firstElementChild;
}

function renderShareButton(icon, onClick) {
	const { React, ReactDOMClient, ReactDOMPortal } = getSiteComponents();
	if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

	const container = findMetaContainer();
	if (!container) return false;

	const template = readActionTemplate(container, "ugc-share-btn");
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

	const UgcShareButton = createShareButton(React, template, icon, onClick);

	_shareContainer = container;
	_shareAnchor = anchor;
	_shareRoot = renderInSiteContext(
		ReactDOMPortal.createPortal(
			React.createElement(UgcShareButton),
			anchor,
		),
		_shareHost,
		{
			onError: (err) =>
				console.error("[ugcShareButton] render failed:", err),
		},
	);

	return !!_shareRoot;
}

function scheduleShareRecheck(icon, onClick) {
	if (_shareRenderPending) return;
	_shareRenderPending = true;
	requestAnimationFrame(() => {
		_shareRenderPending = false;
		if (_shareEnabled && !isShareButtonAttached()) {
			renderShareButton(icon, onClick);
		}
	});
}

function mountUgcShareButton(icon, onClick) {
	_shareEnabled = true;

	if (isShareButtonAttached()) return true;
	if (!renderShareButton(icon, onClick)) return false;

	if (!_shareBodyObserver) {
		_shareBodyObserver = new MutationObserver(() =>
			scheduleShareRecheck(icon, onClick),
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
