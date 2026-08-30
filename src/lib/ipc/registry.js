import { ipcMain } from "electron";

function bind(channel, handler) {
	const { mode = "handle", fn } = normalizeEntry(handler);

	if (ipcMain.listenerCount(channel)) return;

	if (mode === "on") {
		ipcMain.on(channel, fn);
	} else if (mode === "sync") {
		ipcMain.on(channel, (event, ...args) => {
			event.returnValue = fn(event, ...args);
		});
	} else {
		ipcMain.handle(channel, fn);
	}
}

function normalizeEntry(handler) {
	if (typeof handler === "function") return { mode: "handle", fn: handler };
	return handler;
}

export function registerHandlers(map) {
	for (const [channel, handler] of Object.entries(map)) {
		bind(channel, handler);
	}
}

export function on(fn) {
	return { mode: "on", fn };
}

export function sync(fn) {
	return { mode: "sync", fn };
}

export function safe(fn) {
	return async (...args) => {
		try {
			const result = await fn(...args);
			return result ?? { ok: true };
		} catch (err) {
			return { ok: false, error: err?.message ?? String(err) };
		}
	};
}
