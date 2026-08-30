(() => {
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
