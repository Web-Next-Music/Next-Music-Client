	const visualizer = createVisualizer();

	window.__nmcVisualizerApplyAccent = (color) =>
		visualizer.setAccentOverride(color);
	window.__nmcVisualizerClearAccent = () => visualizer.clearAccentOverride();

	const apiTimer = setInterval(() => {
		const api = window.nextmusicApi;
		if (!api) return;
		clearInterval(apiTimer);
		api.visualizer = {
			setAccentColor: (color) => {
				window.__nmcVisualizerAccentColor = color;
				return window.__nmcVisualizerApplyAccent(color);
			},
			clearAccentColor: () => {
				delete window.__nmcVisualizerAccentColor;
				window.__nmcVisualizerClearAccent();
			},
		};
		if (window.__nmcVisualizerAccentColor !== undefined) {
			window.__nmcVisualizerApplyAccent(window.__nmcVisualizerAccentColor);
		}
	}, WAIT_INTERVAL_MS);

	const timer = setInterval(() => {
		const api = window.nextmusicApi;
		if (window.__nmcVis && typeof api?.onTrackChange === "function") {
			clearInterval(timer);
			visualizer.start(api);
		}
	}, WAIT_INTERVAL_MS);
})();
