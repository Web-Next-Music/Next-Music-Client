(() => {
	const API = window.nextmusicApi;

	function extractTrackId(text) {
		try {
			const url = new URL(text);
			const match = url.pathname.match(/\/track\/(\d+)/);
			if (match) return match[1];
		} catch (e) {}

		if (/^\d+$/.test(text)) {
			return text;
		}

		return null;
	}

	document.addEventListener("paste", function (event) {
		const active = document.activeElement;

		const isTextField =
			active &&
			(active.tagName === "INPUT" ||
				active.tagName === "TEXTAREA" ||
				active.isContentEditable);

		if (!isTextField) {
			const text = event.clipboardData.getData("text");
			const id = extractTrackId(text);

			if (!id) return;

			const currentTrack = API.getCurrentTrack();

			if (id === String(currentTrack.id)) return;

			API.playTrackById(id);
		}
	});
})();
