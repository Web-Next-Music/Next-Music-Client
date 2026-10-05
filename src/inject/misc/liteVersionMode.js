(function enableLiteMode() {
	const STORAGE_KEY = "__ym_lite_mode";

	function findStore() {
		const key = Object.keys(document.body).find((k) =>
			k.startsWith("__reactFiber"),
		);
		if (!key) return null;
		let store = null;
		const visited = new WeakSet();
		(function walk(f, d) {
			if (!f || d > 800 || visited.has(f) || store) return;
			visited.add(f);
			let s = f.memoizedState;
			while (s) {
				const m = s.memoizedState;
				if (
					m &&
					typeof m === "object" &&
					!Array.isArray(m) &&
					"experiments" in m
				)
					store = m;
				s = s.next;
			}
			walk(f.child, d + 1);
			walk(f.sibling, d + 1);
		})(document.body[key], 0);
		return store;
	}

	function findSettings(store) {
		for (const val of Object.values(store)) {
			if (!val?.$treenode) continue;
			const allKeys = [];
			let obj = val;
			while (obj && obj !== Object.prototype) {
				allKeys.push(...Object.getOwnPropertyNames(obj));
				obj = Object.getPrototypeOf(obj);
			}
			if (
				allKeys.some(
					(k) =>
						k.toLowerCase().includes("lite") &&
						k.toLowerCase().includes("version"),
				)
			) {
				return val;
			}
		}
		return null;
	}

	function findLiteObservable(settings) {
		const sym = Object.getOwnPropertySymbols(settings).find((s) =>
			s.toString().includes("mobx"),
		);
		if (!sym) return null;
		const admin = settings[sym];
		if (!admin?.values_) return null;
		for (const [name, obs] of admin.values_.entries()) {
			if (
				name.toLowerCase().includes("lite") &&
				!name.toLowerCase().includes("enabled") &&
				!name.toLowerCase().includes("disabled") &&
				!name.toLowerCase().includes("available")
			) {
				const sv = obs.value_?.storedValue;
				if (sv === "ENABLED" || sv === "DISABLED" || sv === undefined)
					return obs;
			}
		}
		return null;
	}

	function findLiteSnapshotKey(current) {
		return Object.keys(current).find(
			(k) =>
				k.toLowerCase().includes("lite") &&
				(current[k] === "ENABLED" ||
					current[k] === "DISABLED" ||
					current[k] === undefined),
		);
	}

	function apply() {
		const store = findStore();
		if (!store) return false;
		try {
			const settings = findSettings(store);
			if (!settings) return false;

			const node = settings.$treenode;
			const current = node.getSnapshot();
			const liteKey = findLiteSnapshotKey(current);
			if (!liteKey) return false;

			const saved = localStorage.getItem(STORAGE_KEY) || "DISABLED";
			node._applySnapshot({ ...current, [liteKey]: saved });

			const liteObs = findLiteObservable(settings);
			if (!liteObs) return false;

			liteObs.changeListeners_ = liteObs.changeListeners_ || [];
			liteObs.changeListeners_.push(function (change) {
				const val = change.newValue?.storedValue;
				if (val) localStorage.setItem(STORAGE_KEY, val);
			});

			return true;
		} catch (e) {
			console.error("[LiteMode]", e);
			return false;
		}
	}

	if (apply()) return;

	const observer = new MutationObserver(() => {
		if (apply()) observer.disconnect();
	});
	observer.observe(document.body, { childList: true, subtree: true });
})();
