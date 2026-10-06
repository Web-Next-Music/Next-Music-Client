	const visualizer = createVisualizer();

	const apiTimer = setInterval(() => {
		const api = window.nextmusicApi;
		if (!api) return;
		clearInterval(apiTimer);
		api.visualizer = {
			setAccentColor: (color) => visualizer.setAccentOverride(color),
			clearAccentColor: () => visualizer.clearAccentOverride(),
		};
	}, WAIT_INTERVAL_MS);

	const timer = setInterval(() => {
		const api = window.nextmusicApi;
		if (window.__nmcVis && typeof api?.onTrackChange === "function") {
			clearInterval(timer);
			visualizer.start(api);
		}
	}, WAIT_INTERVAL_MS);
})();
