let appRequire = null;

function getAppRequire() {
	if (appRequire) return appRequire;

	const webpackGlobal = window.webpackChunk_N_E;
	if (!webpackGlobal?.push || !webpackGlobal?.pop) return null;

	webpackGlobal.push([
		[Symbol()],
		{},
		(r) => {
			appRequire = r;
		},
	]);
	webpackGlobal.pop();

	return appRequire;
}

function findModuleExport(req, exportKey) {
	if (!req) return null;

	const mods = req.m ?? {};
	for (const id of Object.keys(mods)) {
		try {
			const m = req(id);
			if (m && typeof m[exportKey] === "function") {
				return m[exportKey];
			}
		} catch {}
	}
	return null;
}

function waitForNextmusicApi(callback, { timeout = 500 } = {}) {
	let stopped = false;
	let timer = null;

	function tick() {
		if (stopped) return;
		if (window.nextmusicApi) {
			callback();
			return;
		}
		timer = setTimeout(tick, timeout);
	}

	tick();

	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
	};
}

function connectWithReconnect(
	url,
	{ onOpen, onMessage, onClose, onError, reconnectDelay = 2000 } = {},
) {
	let socket = null;
	let stopped = false;
	let reconnectTimer = null;

	function open() {
		if (stopped) return;
		socket = new WebSocket(url);

		socket.onopen = (event) => onOpen?.(event, socket);
		socket.onmessage = (event) => onMessage?.(event, socket);
		socket.onerror = (event) => onError?.(event, socket);
		socket.onclose = (event) => {
			onClose?.(event, socket);
			if (stopped) return;
			reconnectTimer = setTimeout(open, reconnectDelay);
		};
	}

	open();

	return {
		send(data) {
			if (socket && socket.readyState === WebSocket.OPEN) {
				socket.send(data);
			}
		},
		stop() {
			stopped = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			socket?.close();
		},
		getSocket() {
			return socket;
		},
	};
}

function injectStyleTag(id, css) {
	let el = document.getElementById(id);
	if (el) {
		el.textContent = css;
		return el;
	}
	el = document.createElement("style");
	el.id = id;
	el.textContent = css;
	document.head.appendChild(el);
	return el;
}

function removeStyleTag(id) {
	document.getElementById(id)?.remove();
}

function encodeTrackKey(data, encryptionKey) {
	const compact = { u: data.url };
	if (data.title) compact.t = data.title;
	if (data.artist) compact.a = data.artist;
	if (data.cover) compact.c = data.cover;

	const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
	const keyBytes = new TextEncoder().encode(encryptionKey || "");
	const out = new Uint8Array(jsonBytes.length);
	for (let i = 0; i < jsonBytes.length; i++) {
		out[i] = jsonBytes[i] ^ keyBytes[i % keyBytes.length];
	}
	return btoa(String.fromCharCode(...out))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function decodeTrackKey(encodedKey, encryptionKey) {
	try {
		let b64 = encodedKey.replace(/-/g, "+").replace(/_/g, "/");
		b64 += "=".repeat((4 - (b64.length % 4)) % 4);

		const binaryString = atob(b64);
		const keyBytes = new TextEncoder().encode(encryptionKey || "");
		const out = new Uint8Array(binaryString.length);

		for (let i = 0; i < binaryString.length; i++) {
			out[i] = binaryString.charCodeAt(i) ^ keyBytes[i % keyBytes.length];
		}

		const jsonString = new TextDecoder().decode(out);
		const data = JSON.parse(jsonString);

		return {
			url: data.u,
			title: data.t,
			artist: data.a,
			cover: data.c,
		};
	} catch (e) {
		console.warn("[trackKey] Failed to decode:", e.message);
		return null;
	}
}

function searchFiber(fiber, cls, depth = 0) {
	if (typeof cls !== "function") return [];

	const found = [];

	function search(fiber, depth) {
		if (!fiber || depth > 50) return;
		if (fiber.stateNode instanceof cls) found.push(fiber.stateNode);
		let state = fiber.memoizedState;

		while (state) {
			if (state.memoizedState instanceof cls)
				found.push(state.memoizedState);
			state = state.next;
		}

		function searchObj(obj, visited = new Set()) {
			if (
				!obj ||
				typeof obj !== "object" ||
				visited.has(obj) ||
				obj instanceof Window
			)
				return;
			visited.add(obj);
			try {
				if (obj instanceof cls) {
					found.push(obj);
					return;
				}
				for (const v of Object.values(obj)) searchObj(v, visited);
			} catch {}
		}

		searchObj(fiber.memoizedProps);
		search(fiber.child, depth + 1);
		search(fiber.sibling, depth + 1);
	}

	search(fiber, depth);
	return found;
}
