export function injectJsText(code, encryptionKey, scriptId) {
	window.__NEXT_MUSIC_ENCRYPTION_KEY__ = encryptionKey;
	if (document.querySelector(`script[data-injected="${scriptId}"]`)) return;

	const script = document.createElement("script");
	script.type = "text/javascript";
	script.textContent = code;
	script.dataset.injected = scriptId;
	document.head.appendChild(script);
}
