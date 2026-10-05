	// Button Injection
	let isDownloading = false;

	async function onDownloadClick() {
		if (isDownloading) return;

		const currentTrack = window.nextmusicApi?.getCurrentTrack?.();
		if (!currentTrack) {
			showError("Play a track first");
			return;
		}

		isDownloading = true;
		window.nextmusicApi.updateDownloadButtonState({
			phase: "downloading",
			progress: 0,
		});

		try {
			await downloadTrack(currentTrack, (phase, ratio) => {
				window.nextmusicApi.updateDownloadButtonState({
					phase: phase === "convert" ? "converting" : "downloading",
					progress: ratio,
				});
			});
		} catch (err) {
			showError(`Error: ${err.message}`);
		} finally {
			isDownloading = false;
			window.nextmusicApi.updateDownloadButtonState({ phase: "idle" });
		}
	}

	function startDownloadButton() {
		window.nextmusicApi.mountDownloadButton(
			{ phase: "idle" },
			onDownloadClick,
		);
		window.nextmusicApi.onTrackChange(() => {
			window.nextmusicApi.mountDownloadButton(
				{ phase: "idle" },
				onDownloadClick,
			);
		});
	}

	function waitForApi() {
		if (window.nextmusicApi) {
			startDownloadButton();
		} else {
			setTimeout(waitForApi, 500);
		}
	}

	waitForApi();
})();
