export function injectCssFile(injectedPath) {
	if (document.querySelector(`link[data-injected="${injectedPath}"]`)) return;

	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.type = "text/css";
	link.href = `file://${injectedPath}`;
	link.dataset.injected = injectedPath;
	document.head.appendChild(link);
}
