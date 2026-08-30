let _shareIcon = null;
let _shareOnClick = null;
let _shareTemplate = null;

const _shareFeature = createPortalFeature({
	id: "ugcShareButton",
	findMount() {
		const container = findMetaContainer();
		if (!container) return null;
		const template = readActionTemplate(container, "ugc-share-btn");
		if (!template) return null;
		_shareTemplate = template;
		return container;
	},
	isAttached(container) {
		return !!container.querySelector("#ugc-share-btn");
	},
	placeAnchor({ mountEl, anchor }) {
		const reference = mountEl.firstElementChild;
		if (reference) mountEl.insertBefore(anchor, reference);
		else mountEl.appendChild(anchor);
	},
	buildElement({ React }) {
		const template = _shareTemplate;
		return React.createElement(template.Button, {
			...template.buttonProps,
			id: "ugc-share-btn",
			"aria-label": "Share track",
			icon: React.createElement(template.Icon, _shareIcon),
			onClick: _shareOnClick,
		});
	},
	onError: (err) => console.error("[ugcShareButton] render failed:", err),
});

function mountUgcShareButton(icon, onClick) {
	_shareIcon = icon;
	_shareOnClick = onClick;
	return _shareFeature.mount();
}

function unmountUgcShareButton() {
	_shareFeature.unmount();
}
