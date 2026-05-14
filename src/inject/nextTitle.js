(function hardNextTitleShield() {
	const REQUIRED_TITLE = "Next Music";

	document.title = REQUIRED_TITLE;

	function enforceTitle() {
		const titleEl = document.querySelector("title");
		if (titleEl && titleEl.textContent !== REQUIRED_TITLE) {
			titleEl.textContent = REQUIRED_TITLE;
		}
	}

	Object.defineProperty(document, "title", {
		configurable: true,
		enumerable: true,

		get() {
			return REQUIRED_TITLE;
		},

		set(_) {
			enforceTitle();
		},
	});

	let titleObserver = null;

	function observeTitle() {
		const titleEl = document.querySelector("title");
		if (titleEl && !titleObserver) {
			titleObserver = new MutationObserver(enforceTitle);
			titleObserver.observe(titleEl, {
				childList: true,
				characterData: true,
				subtree: true,
			});
		}
	}

	const headObserver = new MutationObserver(() => {
		enforceTitle();
		observeTitle();
	});

	headObserver.observe(document.head || document.documentElement, {
		childList: true,
		subtree: false,
	});

	observeTitle();

	window.stopNextTitleShield = () => {
		headObserver.disconnect();
		titleObserver?.disconnect();
	};
})();
