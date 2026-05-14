let _store = null;

function _findSonataStore() {
	if (_store && _store.sonataState?.entityMeta !== undefined) return _store;
	_store = null;

	const root = document.getElementById("__next") || document.body;
	const fk = Object.keys(root).find((k) => k.startsWith("__reactFiber"));
	if (!fk) return null;

	const seen = new Set();

	function walkToRoot(node, steps = 0) {
		if (!node?._parent || steps > 30) return node;
		return walkToRoot(node._parent, steps + 1);
	}

	function walkFiber(fiber, depth) {
		if (!fiber || depth > 1000 || seen.has(fiber)) return null;
		seen.add(fiber);

		let s = fiber.memoizedState;
		while (s) {
			try {
				const obs = s.memoizedState?.current?.reaction?.observing_;
				if (obs) {
					for (const item of Object.values(obs)) {
						const node = item?.value_;
						if (!node || seen.has(node)) continue;
						seen.add(node);
						const rootNode = walkToRoot(node);
						const sv = rootNode?.storedValue;
						if (sv?.sonataState?.entityMeta?.averageColor !== undefined) {
							return sv;
						}
					}
				}
			} catch {}
			s = s.next;
		}

		return (
			walkFiber(fiber.child, depth + 1) || walkFiber(fiber.sibling, depth + 1)
		);
	}

	_store = walkFiber(root[fk], 0);
	return _store;
}

function getCurrentAverageColor() {
	const store = _findSonataStore();
	if (!store) return null;
	return store.sonataState?.entityMeta?.averageColor ?? null;
}
