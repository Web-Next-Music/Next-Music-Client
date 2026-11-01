export function injectJsFile(injectedPath, encryptionKey) {
	window.__NEXT_MUSIC_ENCRYPTION_KEY__ = encryptionKey;
	if (document.querySelector(`script[data-injected="${injectedPath}"]`)) return;

	const script = document.createElement("script");
	script.type = "text/javascript";
	script.src = `file://${injectedPath}`;
	script.dataset.injected = injectedPath;
	script.async = false;
	return new Promise((resolve, reject) => {
		script.onload = resolve;
		script.onerror = () => reject(new Error(`Failed to load ${injectedPath}`));
		document.head.appendChild(script);
	});
}
