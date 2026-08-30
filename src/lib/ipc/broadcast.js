import { BrowserWindow } from "electron";

export function broadcastToRenderers(channel, payload, { except } = {}) {
	for (const win of BrowserWindow.getAllWindows()) {
		if (win === except || win.isDestroyed()) continue;
		win.webContents.send(channel, payload);
	}
}

export function sendToWindow(win, channel, payload) {
	if (!win || win.isDestroyed()) return false;
	win.webContents.send(channel, payload);
	return true;
}
