(() => {
	const css = `
		.ym-dark-theme {
			--ym-background-color-primary-enabled-content: #0005 !important;
			--ym-background-color-primary-enabled-basic: transparent !important;
		}

		html,
		body,
		.ym-dark-theme,
		.ym-light-theme,
		[class*="CommonLayout_root"] {
			background: transparent !important;
			background-color: transparent !important;
		}

		.PlayerBar_root__cXUnU {
			background-color: #0005 !important;
		}
`;

	const styleEl = document.createElement("style");
	styleEl.id = "liquid-ass-style";
	styleEl.textContent = css;
	(document.head || document.documentElement).appendChild(styleEl);

	const body = document.body;

	const applyTheme = () => {
		if (
			!body.classList.contains("ym-dark-theme") &&
			!body.classList.contains("ym-light-theme")
		) {
			body.classList.add("ym-dark-theme");
		} else if (body.classList.contains("ym-light-theme")) {
			body.classList.replace("ym-light-theme", "ym-dark-theme");
		}
	};

	applyTheme();

	const observer = new MutationObserver(() => applyTheme());
	observer.observe(body, { attributes: true, attributeFilter: ["class"] });
})();
