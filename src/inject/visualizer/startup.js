	const visualizer = createVisualizer();

	window.NextMusicVisualizer = {
		setAccentColor: (color) => visualizer.setAccentOverride(color),
		clearAccentColor: () => visualizer.clearAccentOverride(),
	};

	const timer = setInterval(() => {
		const api = window.nextmusicApi;
		if (window.__nmcVis && typeof api?.onTrackChange === "function") {
			clearInterval(timer);
			visualizer.start(api);
		}
	}, WAIT_INTERVAL_MS);
})();
