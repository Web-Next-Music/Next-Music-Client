let _panelOpen = false;

function renderPanel() {
	if (!_panelOpen) return;
	window.nextmusicApi?.updateListenAlongPanel?.(panelState());
}

function openPanel() {
	_panelOpen = true;
	window.nextmusicApi?.mountListenAlongPanel?.(panelState(), panelHandlers());
}

function closePanel() {
	_panelOpen = false;
	window.nextmusicApi?.unmountListenAlongPanel?.();
}

function togglePanel() {
	if (_panelOpen) closePanel();
	else openPanel();
}

function isTypingTarget(el) {
	if (!el) return false;
	const tag = el.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function onPanelHotkey(event) {
	if (event.ctrlKey || event.altKey || event.metaKey) return;
	if (event.code !== "KeyZ") return;
	if (isTypingTarget(document.activeElement)) return;

	event.preventDefault();
	togglePanel();
}

document.addEventListener("keydown", onPanelHotkey);
