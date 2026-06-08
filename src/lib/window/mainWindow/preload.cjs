"use strict";

const { contextBridge, ipcRenderer } = require("electron");

if (process.argv.includes("--nmc-titlebar")) {
	contextBridge.exposeInMainWorld("nmcWindow", {
		minimize: () => ipcRenderer.send("nmc-minimize"),
		maximize: () => ipcRenderer.send("nmc-maximize"),
		close: () => ipcRenderer.send("nmc-close"),
		isMaximized: () => ipcRenderer.invoke("nmc-is-maximized"),

		onMaximizeChange: (callback) => {
			ipcRenderer.on("nmc-maximized", () => callback(true));
			ipcRenderer.on("nmc-unmaximized", () => callback(false));
		},

		removeMaximizeListeners: () => {
			ipcRenderer.removeAllListeners("nmc-maximized");
			ipcRenderer.removeAllListeners("nmc-unmaximized");
		},
	});
}

const EXPERIMENTS_ARG_PREFIX = "--nmc-experiments=";

function parseExperimentsArg() {
	const arg = process.argv.find((a) => a.startsWith(EXPERIMENTS_ARG_PREFIX));
	if (!arg) return {};
	try {
		return JSON.parse(arg.slice(EXPERIMENTS_ARG_PREFIX.length));
	} catch {
		return {};
	}
}

function getExperimentsFromMain() {
	try {
		const result = ipcRenderer.sendSync("nmc:get-experiments");
		if (result && typeof result === "object" && result.experiments)
			return result;
	} catch {
		/* fall through */
	}
	return { experiments: parseExperimentsArg(), managedNames: [] };
}

const { experiments: rawExperiments, managedNames } = getExperimentsFromMain();

const storeOverrides = {};
const rscOverrides = {};
for (const [name, state] of Object.entries(rawExperiments)) {
	if (state === "on" || state === "default") {
		storeOverrides[name] = state;
		rscOverrides[name] = { group: state, value: { title: state } };
	}
}

function experimentPatcher(rscOverrides, storeOverrides, managedNames) {
	const rscNames = Object.keys(rscOverrides);

	const mentionsOverride = (str) =>
		rscNames.some((name) => str.indexOf('"' + name + '"') !== -1);

	function patchRscString(raw) {
		let result = raw;

		for (const name of rscNames) {
			const marker = '"' + name + '":';
			let from = 0;

			for (;;) {
				const markerAt = result.indexOf(marker, from);
				if (markerAt === -1) break;

				const objStart = result.indexOf("{", markerAt + marker.length);
				if (objStart === -1) break;

				let depth = 0;
				let objEnd = -1;
				for (let i = objStart; i < result.length; i++) {
					if (result[i] === "{") depth++;
					else if (result[i] === "}" && --depth === 0) {
						objEnd = i + 1;
						break;
					}
				}
				if (objEnd === -1) break;

				try {
					const merged = Object.assign(
						JSON.parse(result.slice(objStart, objEnd)),
						rscOverrides[name],
					);
					const replacement = JSON.stringify(merged);
					result =
						result.slice(0, objStart) + replacement + result.slice(objEnd);
					from = objStart + replacement.length;
				} catch {
					from = markerAt + marker.length;
				}
			}
		}

		return result;
	}

	const patchChunk = (chunk) => {
		if (
			Array.isArray(chunk) &&
			chunk[0] === 1 &&
			typeof chunk[1] === "string" &&
			mentionsOverride(chunk[1])
		) {
			chunk[1] = patchRscString(chunk[1]);
		}
	};

	const patchSnapshot = (item) => {
		const root = item && item.experiments && item.experiments.experiments;
		if (!root || typeof root !== "object") return;
		for (const name of rscNames) {
			if (root[name]) Object.assign(root[name], rscOverrides[name]);
		}
	};

	function interceptArray(prop, patchItem) {
		const arr = Array.isArray(window[prop]) ? window[prop] : [];
		arr.forEach(patchItem);

		let nativePush = null;
		Object.defineProperty(arr, "push", {
			configurable: true,
			enumerable: false,
			get() {
				return function (...items) {
					items.forEach(patchItem);
					return (nativePush || Array.prototype.push).apply(arr, items);
				};
			},
			set(fn) {
				nativePush = fn;
			},
		});

		Object.defineProperty(window, prop, {
			configurable: true,
			enumerable: true,
			get() {
				return arr;
			},
			set(next) {
				if (Array.isArray(next) && next !== arr) next.forEach(patchItem);
			},
		});
	}

	function patchStorageReads() {
		for (const storeName of ["sessionStorage", "localStorage"]) {
			try {
				const store = window[storeName];
				const nativeGetItem = store.getItem.bind(store);
				store.getItem = (key) => {
					const value = nativeGetItem(key);
					return typeof value === "string" && mentionsOverride(value)
						? patchRscString(value)
						: value;
				};
			} catch {
				/* storage may be unavailable */
			}
		}
	}

	function patchInlineScripts() {
		const patchNode = (node) => {
			try {
				if (
					node.tagName === "SCRIPT" &&
					typeof node.textContent === "string" &&
					mentionsOverride(node.textContent)
				) {
					node.textContent = patchRscString(node.textContent);
				}
			} catch {
				/* ignore non-patchable nodes */
			}
		};

		try {
			document.querySelectorAll("script").forEach(patchNode);
		} catch {
			/* document not ready */
		}

		new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.addedNodes) m.addedNodes.forEach(patchNode);
			}
		}).observe(document.documentElement || document, {
			childList: true,
			subtree: true,
		});
	}

	if (rscNames.length) {
		interceptArray("__next_f", patchChunk);
		interceptArray("__STATE_SNAPSHOT__", patchSnapshot);
		patchStorageReads();
		patchInlineScripts();
	}

	let webpackRequire = null;
	let mstModuleId = null;
	let keysModuleId = null;
	let containerStorage = null;
	let containerKey = null;
	let appliedKeys = [];

	// Grab the webpack require by pushing an inert chunk that hands it to us
	function getWebpackRequire() {
		if (webpackRequire) return webpackRequire;

		const chunkKey = Object.keys(window).find(
			(k) => k.indexOf("webpackChunk") === 0,
		);
		if (!chunkKey) return null;

		try {
			window[chunkKey].push([
				[Math.random()],
				{},
				(require) => {
					webpackRequire = require;
				},
			]);
		} catch {
			return null;
		}
		return webpackRequire;
	}

	function findExperimentsStore() {
		for (const el of document.querySelectorAll("*")) {
			const fiberKey = Object.keys(el).find(
				(k) => k.indexOf("__reactFiber") === 0,
			);
			if (!fiberKey) continue;

			let fiber = el[fiberKey];
			for (let depth = 0; depth < 200 && fiber; depth++) {
				const value = fiber.memoizedProps && fiber.memoizedProps.value;
				if (
					value &&
					value.experiments &&
					typeof value.experiments.checkExperiment === "function"
				) {
					return value;
				}
				fiber = fiber.return;
			}
		}
		return null;
	}

	const findModuleId = (require, matches) =>
		Object.keys(require.m).find((id) => {
			try {
				return matches(require(id));
			} catch {
				return false;
			}
		});

	const isMstModule = (m) =>
		m &&
		typeof m._$ === "function" &&
		typeof m.gK === "object" &&
		typeof m.Zn === "function";

	const isKeysModule = (m) =>
		m &&
		typeof m.c === "object" &&
		m.c !== null &&
		"OverwrittenExperiments" in m.c &&
		typeof m.c.OverwrittenExperiments === "string";

	function ensureContainer() {
		if (containerStorage && containerKey) return true;

		const require = getWebpackRequire();
		if (!require) return false;

		const store = findExperimentsStore();
		if (!store) return false;

		mstModuleId = mstModuleId || findModuleId(require, isMstModule);
		keysModuleId = keysModuleId || findModuleId(require, isKeysModule);
		if (!mstModuleId || !keysModuleId) return false;

		try {
			containerStorage = require(mstModuleId)._$(
				store.experiments,
			).containerStorage;
			containerKey = require(keysModuleId).c.OverwrittenExperiments;
		} catch {
			return false;
		}
		return Boolean(containerStorage && containerKey);
	}

	const firstObjectValue = (data) => {
		for (const key in data) {
			if (data[key] && typeof data[key] === "object") return data[key];
		}
		return null;
	};

	function buildEntry(state, template) {
		let entry = {};
		if (template && typeof template === "object") {
			try {
				entry = JSON.parse(JSON.stringify(template));
			} catch {
				entry = {};
			}
		}
		entry.group = state;
		entry.value = Object.assign({}, entry.value, { title: state });
		return entry;
	}

	function writeOverrides() {
		if (!ensureContainer()) return false;

		const data = containerStorage.get(containerKey) || {};
		const template = firstObjectValue(data);
		const patched = Object.assign({}, data);

		for (const name of appliedKeys) {
			if (!(name in storeOverrides)) delete patched[name];
		}
		// Remove stale entries from now-disabled addons. appliedKeys only covers
		// the current page session; managedNames ensures cross-session cleanup.
		if (managedNames) {
			for (const name of managedNames) {
				if (!(name in storeOverrides)) delete patched[name];
			}
		}
		for (const name in storeOverrides) {
			patched[name] = buildEntry(storeOverrides[name], data[name] || template);
		}
		appliedKeys = Object.keys(storeOverrides);

		containerStorage.set(containerKey, patched);
		return true;
	}

	window.__nmcApplyExperiments = (next) => {
		storeOverrides = next && typeof next === "object" ? next : {};
		return writeOverrides();
	};

	function markExperimentsDone() {
		window.__nmcExperimentsDone = true;
		window.dispatchEvent(new Event("__nmcExperimentsApplied"));
	}

	let done = Object.keys(storeOverrides).length === 0;
	if (done) window.__nmcExperimentsDone = true;

	const tryWrite = () => {
		if (done) return true;
		done = writeOverrides();
		if (done) markExperimentsDone();
		return done;
	};

	if (!tryWrite()) {
		let frames = 0;
		(function pollFrame() {
			if (tryWrite()) return;
			if (frames++ < 600) requestAnimationFrame(pollFrame);
		})();

		new MutationObserver((_records, observer) => {
			if (tryWrite()) observer.disconnect();
		}).observe(document.documentElement || document, {
			childList: true,
			subtree: true,
		});
	}
}

function injectIntoMainWorld(code) {
	const inject = () => {
		const script = document.createElement("script");
		script.textContent = code;
		document.documentElement.appendChild(script);
		script.remove();
	};

	if (document.documentElement) {
		inject();
		return;
	}

	const observer = new MutationObserver(() => {
		if (document.documentElement) {
			observer.disconnect();
			inject();
		}
	});
	observer.observe(document, { childList: true });
}

injectIntoMainWorld(
	`(${experimentPatcher.toString()})(${JSON.stringify(rscOverrides)}, ${JSON.stringify(storeOverrides)}, ${JSON.stringify(managedNames)});`,
);

contextBridge.exposeInMainWorld("nmcConvert", {
	mp3: (buf) => ipcRenderer.invoke("nmc:convert-mp3", buf),
	onProgress: (cb) => {
		const handler = (_e, v) => cb(v);
		ipcRenderer.on("nmc:convert-progress", handler);
		return () => ipcRenderer.removeListener("nmc:convert-progress", handler);
	},
});
