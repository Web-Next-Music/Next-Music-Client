"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Titlebar IPC
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

// Experiment patcher — built from config passed via argv
const _experimentsArg = process.argv.find((a) =>
	a.startsWith("--nmc-experiments="),
);
const _experimentsRaw = (() => {
	try {
		return _experimentsArg
			? JSON.parse(_experimentsArg.slice("--nmc-experiments=".length))
			: {};
	} catch {
		return {};
	}
})();

const EXPERIMENT_OVERRIDES = {};
for (const [name, state] of Object.entries(_experimentsRaw)) {
	if (state === "on" || state === "default") {
		EXPERIMENT_OVERRIDES[name] = {
			group: state,
			value: { title: state },
		};
	}
}

const patcherCode = `
(function () {
	var overrides = ${JSON.stringify(EXPERIMENT_OVERRIDES)};

	function patchRSCString(raw) {
		var result = raw;
		for (var expKey in overrides) {
			var expVal = overrides[expKey];
			var marker = '"' + expKey + '":';
			var searchFrom = 0;
			while (true) {
				var idx = result.indexOf(marker, searchFrom);
				if (idx === -1) break;
				var objStart = result.indexOf('{', idx + marker.length);
				if (objStart === -1) break;
				var depth = 0, objEnd = -1;
				for (var i = objStart; i < result.length; i++) {
					var c = result[i];
					if (c === '{') depth++;
					else if (c === '}') { depth--; if (depth === 0) { objEnd = i + 1; break; } }
				}
				if (objEnd === -1) break;
				try {
					var obj = JSON.parse(result.slice(objStart, objEnd));
					Object.assign(obj, expVal);
					var replacement = JSON.stringify(obj);
					result = result.slice(0, objStart) + replacement + result.slice(objEnd);
					searchFrom = objStart + replacement.length;
				} catch (e) {
					searchFrom = idx + marker.length;
				}
			}
		}
		return result;
	}

	function patchChunk(chunk) {
		if (!Array.isArray(chunk) || chunk[0] !== 1) return;
		if (typeof chunk[1] !== 'string') return;
		var needsPatch = Object.keys(overrides).some(function (k) {
			return chunk[1].indexOf('"' + k + '"') !== -1;
		});
		if (!needsPatch) return;
		chunk[1] = patchRSCString(chunk[1]);
	}

	var _arr = window.__next_f || [];
	_arr.forEach(patchChunk);
	var _customPush = null;

	function ourPush() {
		var args = Array.prototype.slice.call(arguments);
		args.forEach(patchChunk);
		if (_customPush) return _customPush.apply(_arr, args);
		return Array.prototype.push.apply(_arr, args);
	}

	Object.defineProperty(_arr, 'push', {
		get: function () { return ourPush; },
		set: function (fn) { _customPush = fn; },
		configurable: true,
		enumerable: false,
	});

	Object.defineProperty(window, '__next_f', {
		get: function () { return _arr; },
		set: function (newVal) {
			if (Array.isArray(newVal) && newVal !== _arr) {
				newVal.forEach(patchChunk);
			}
		},
		configurable: true,
		enumerable: true,
	});

	['sessionStorage', 'localStorage'].forEach(function (storeName) {
		try {
			var store = window[storeName];
			var origGetItem = store.getItem.bind(store);
			store.getItem = function (key) {
				var val = origGetItem(key);
				if (typeof val !== 'string') return val;
				if (Object.keys(overrides).some(function (k) { return val.indexOf('"' + k + '"') !== -1; })) {
					return patchRSCString(val);
				}
				return val;
			};
		} catch (e) {}
	});

	function patchSnapshotItem(item) {
		if (!item || typeof item !== 'object') return;
		var root = item.experiments && item.experiments.experiments;
		if (!root || typeof root !== 'object') return;
		for (var expKey in overrides) {
			if (!root[expKey]) continue;
			Object.assign(root[expKey], overrides[expKey]);
		}
	}

	var _snap = Array.isArray(window.__STATE_SNAPSHOT__) ? window.__STATE_SNAPSHOT__ : [];
	_snap.forEach(patchSnapshotItem);
	var _snapPush = null;

	function snapPush() {
		var args = Array.prototype.slice.call(arguments);
		args.forEach(patchSnapshotItem);
		if (_snapPush) return _snapPush.apply(_snap, args);
		return Array.prototype.push.apply(_snap, args);
	}

	Object.defineProperty(_snap, 'push', {
		get: function () { return snapPush; },
		set: function (fn) { _snapPush = fn; },
		configurable: true,
		enumerable: false,
	});

	Object.defineProperty(window, '__STATE_SNAPSHOT__', {
		get: function () { return _snap; },
		set: function (newVal) {
			if (Array.isArray(newVal) && newVal !== _snap) {
				newVal.forEach(patchSnapshotItem);
			}
		},
		configurable: true,
		enumerable: true,
	});

	function patchScriptTags() {
		try {
			document.querySelectorAll('script').forEach(function (s) {
				try {
					var txt = s.textContent;
					if (typeof txt !== 'string') return;
					if (Object.keys(overrides).some(function (k) { return txt.indexOf('"' + k + '"') !== -1; })) {
						s.textContent = patchRSCString(txt);
					}
				} catch (e) {}
			});
		} catch (e) {}
	}
	patchScriptTags();

	var scriptObserver = new MutationObserver(function (muts) {
		muts.forEach(function (m) {
			m.addedNodes && m.addedNodes.forEach(function (n) {
				if (n && n.tagName === 'SCRIPT') {
					try {
						var txt = n.textContent;
						if (typeof txt === 'string' && Object.keys(overrides).some(function (k) { return txt.indexOf('"' + k + '"') !== -1; })) {
							n.textContent = patchRSCString(txt);
						}
					} catch (e) {}
				}
			});
		});
	});
	scriptObserver.observe(document.documentElement || document, { childList: true, subtree: true });

})();
`;

function injectIntoMainWorld(code) {
	const inject = () => {
		const script = document.createElement("script");
		script.textContent = code;
		document.documentElement.appendChild(script);
		script.remove();
	};

	if (document.documentElement) {
		inject();
	} else {
		const observer = new MutationObserver(() => {
			if (document.documentElement) {
				observer.disconnect();
				inject();
			}
		});
		observer.observe(document, { childList: true });
	}
}

injectIntoMainWorld(patcherCode);
