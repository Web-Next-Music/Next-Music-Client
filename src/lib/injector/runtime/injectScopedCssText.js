export function injectScopedCssText(cssText, styleId) {
	if (document.querySelector(`style[data-injected="${styleId}"]`)) return;

	const style = document.createElement("style");
	style.dataset.injected = styleId;
	style.textContent = cssText;
	document.head.appendChild(style);
}
