export function injectJsFile(injectedPath, encryptionKey) {
	window.__NEXT_MUSIC_ENCRYPTION_KEY__ = encryptionKey;
	if (document.querySelector(`script[data-injected="${injectedPath}"]`))
		return;

	const script = document.createElement("script");
	script.type = "text/javascript";
	script.src = `file://${injectedPath}`;
	script.dataset.injected = injectedPath;
	document.head.appendChild(script);
}
