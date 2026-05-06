const webpackGlobal = window.webpackChunk_N_E;
let appRequire = null;

webpackGlobal.push([
	[Symbol()],
	{},
	(r) => {
		appRequire = r;
	},
]);
webpackGlobal.pop();

function findModuleExport(req, exportKey) {
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

function searchFiber(fiber, cls, depth = 0) {
	const found = [];

	function search(fiber, depth) {
		if (!fiber || depth > 50) return;
		if (fiber.stateNode instanceof cls) found.push(fiber.stateNode);
		let state = fiber.memoizedState;

		while (state) {
			if (state.memoizedState instanceof cls) found.push(state.memoizedState);
			state = state.next;
		}

		function searchObj(obj, visited = new Set()) {
			if (!obj || typeof obj !== "object" || visited.has(obj)) return;
			visited.add(obj);
			if (obj instanceof cls) {
				found.push(obj);
				return;
			}
			for (const v of Object.values(obj)) searchObj(v, visited);
		}

		searchObj(fiber.memoizedProps);
		search(fiber.child, depth + 1);
		search(fiber.sibling, depth + 1);
	}

	search(fiber, depth);
	return found;
}
