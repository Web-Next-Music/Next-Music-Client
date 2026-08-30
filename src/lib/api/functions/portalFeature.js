function createPortalFeature(config) {
	const {
		id,
		css,
		useSiteContext = true,
		findMount,
		isAttached,
		buildElement,
		placeAnchor,
		onError,
	} = config;

	let root = null;
	let host = null;
	let anchor = null;
	let mountEl = null;
	let bodyObserver = null;
	let renderPending = false;
	let enabled = false;

	function attached() {
		return !!mountEl && mountEl.isConnected && isAttached(mountEl);
	}

	function cleanup() {
		if (root) {
			root.unmount();
			root = null;
		}
		if (host) {
			host.remove();
			host = null;
		}
		if (anchor) {
			anchor.remove();
			anchor = null;
		}
		mountEl = null;
	}

	function portalElement(site) {
		const { React, ReactDOMPortal } = site;
		const target = anchor || mountEl;
		return ReactDOMPortal.createPortal(
			buildElement({
				React,
				ReactDOMPortal,
				mountEl,
				portalTarget: target,
			}),
			target,
		);
	}

	function render() {
		const site = getSiteComponents();
		const { React, ReactDOMClient, ReactDOMPortal } = site;
		if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

		const found = findMount();
		if (!found) return false;

		cleanup();

		host = document.createElement("div");
		host.style.display = "none";
		document.body.appendChild(host);

		mountEl = found;

		if (placeAnchor) {
			anchor = document.createElement("span");
			anchor.style.display = "contents";
			placeAnchor({ mountEl: found, anchor });
		}

		const element = portalElement(site);

		if (useSiteContext) {
			root = renderInSiteContext(element, host, {
				onError: (err) =>
					onError
						? onError(err)
						: console.error(`[${id}] render failed:`, err),
			});
		} else {
			root = ReactDOMClient.createRoot(host);
			root.render(element);
		}

		if (css) injectStyleTag(`${id}-style`, css);

		return !!root;
	}

	function scheduleRecheck() {
		if (renderPending) return;
		renderPending = true;
		requestAnimationFrame(() => {
			renderPending = false;
			if (enabled && !attached()) render();
		});
	}

	function ensureObserver() {
		if (bodyObserver) return;
		bodyObserver = new MutationObserver(scheduleRecheck);
		bodyObserver.observe(document.body, { childList: true, subtree: true });
	}

	return {
		mount() {
			enabled = true;
			ensureObserver();
			if (attached() && root) {
				root.render(portalElement(getSiteComponents()));
				return true;
			}
			return render();
		},
		refresh() {
			if (!enabled || !attached() || !root) return false;
			root.render(portalElement(getSiteComponents()));
			return true;
		},
		unmount() {
			enabled = false;
			cleanup();
			if (css) removeStyleTag(`${id}-style`);
		},
		isAttached: attached,
	};
}
