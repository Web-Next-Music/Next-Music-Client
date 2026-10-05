(function () {
	const COVER_SIZE = 1000;

	// Utilities
	const _utf8 = (s) => new TextEncoder().encode(s);

	function sanitize(name) {
		return (name ?? "").replace(/[/\\?%*:|"<>]/g, "_");
	}

	function showError(msg) {
		window.nextmusicApi?.showErrorToast?.(
			msg,
			window.nextmusicApi.ContainerId?.ERROR,
		);
	}
