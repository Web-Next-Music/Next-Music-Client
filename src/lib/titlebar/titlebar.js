(function () {
	const ICONS = {
		hide: `<svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0.5H10" stroke="currentColor" stroke-width="1"/>
        </svg>`,
		expand: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
        </svg>`,
		restore: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
        </svg>`,
		close: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>`,
	};

	function mountTitleBar() {
		if (!document.body) return;
		if (document.querySelector(".TitleBar_root")) return;
		if (!window.nmcWindow) return;

		const bar = document.createElement("div");
		bar.className = "TitleBar_root";
		// Hard-set a readable fallback color in case Yandex theme CSS
		// variables aren't available (e.g. on some Linux WM/sessions).
		bar.style.color = "var(--nm-btn-color, #707070)";

		if (window.__nmcTitleBarConfig?.showNextText) {
			const label = document.createElement("span");
			label.className = "TitleBar_nextText";

			let displayVersion;

			if (window.__nmcTitleBarConfig?.showYandexMusicVersion) {
				label.textContent = "Yandex Music";
				bar.appendChild(label);

				(function trySetVersion() {
					const ver =
						window.nextmusicApi?.getCurrentYandexMusicVersion();
					if (ver) {
						label.textContent = `Yandex Music ${ver}`;
					} else {
						setTimeout(trySetVersion, 500);
					}
				})();
			} else {
				displayVersion = window.__nmcTitleBarConfig?.version || "";
				label.textContent = `Next Music ${displayVersion || ""}`;
				bar.appendChild(label);
			}
		}

		const btnHide = document.createElement("button");
		btnHide.type = "button";
		btnHide.className = "TitleBar_button";
		btnHide.innerHTML = ICONS.hide;
		btnHide.ariaLabel = "Hide";
		btnHide.addEventListener("click", () => window.nmcWindow.minimize());

		const btnExpand = document.createElement("button");
		btnExpand.type = "button";
		btnExpand.className = "TitleBar_button";
		btnExpand.innerHTML = ICONS.expand;
		btnExpand.ariaLabel = "Expand";
		btnExpand.addEventListener("click", () => window.nmcWindow.maximize());

		const btnClose = document.createElement("button");
		btnClose.type = "button";
		btnClose.className = "TitleBar_button TitleBar_closeButton";
		btnClose.innerHTML = ICONS.close;
		btnClose.ariaLabel = "Close";
		btnClose.addEventListener("click", () => window.nmcWindow.close());

		bar.appendChild(btnHide);
		bar.appendChild(btnExpand);
		bar.appendChild(btnClose);

		document.body.prepend(bar);

		bar.addEventListener("dblclick", (e) => {
			if ([btnHide, btnExpand, btnClose].includes(e.target)) return;
			window.nmcWindow.maximize();
		});

		function updateExpandIcon(isMax) {
			btnExpand.innerHTML = isMax ? ICONS.restore : ICONS.expand;
		}

		window.nmcWindow.isMaximized().then(updateExpandIcon);
		window.nmcWindow.removeMaximizeListeners();
		window.nmcWindow.onMaximizeChange(updateExpandIcon);
	}

	function ensureTitleBar() {
		if (mountTitleBar.mounted) return;
		if (!document.body) return;
		if (document.querySelector(".TitleBar_root")) {
			mountTitleBar.mounted = true;
			return;
		}
		mountTitleBar();
		mountTitleBar.mounted = !!document.querySelector(".TitleBar_root");
	}

	// Also attempt to remount shortly after load, in case the page
	// resets DOM (Yandex Music does full re-renders on navigation).
	window.addEventListener("load", () => setTimeout(ensureTitleBar, 0));

	ensureTitleBar();

	new MutationObserver(() => {
		if (!document.querySelector(".TitleBar_root")) {
			mountTitleBar.mounted = false;
			ensureTitleBar();
		}
	}).observe(document.documentElement || document, {
		childList: true,
		subtree: true,
	});

	if (!document.body) {
		document.addEventListener("DOMContentLoaded", ensureTitleBar, {
			once: true,
		});
	}
})();
