(function enableDevPanel() {
	let done = false;

	function applyPatch() {
		if (done) return;
		const key = Object.keys(document.body).find((k) =>
			k.startsWith("__reactFiber"),
		);
		if (!key) return;

		const visited = new WeakSet();
		(function walk(f, d) {
			if (!f || d > 500 || visited.has(f)) return;
			visited.add(f);
			for (const props of [f.pendingProps, f.memoizedProps]) {
				const cv = props?.value;
				if (cv?.bindings && cv?.shared) {
					const tc = cv.shared.get("TokenConfig");
					if (tc?.get && !tc.__devPatched) {
						const orig = tc.get.bind(tc);
						tc.get = (key) => {
							const val = orig(key);
							return typeof val === "boolean" ? true : val;
						};
						tc.__devPatched = true;
						done = true;
					}
				}
			}
			walk(f.child, d + 1);
			walk(f.sibling, d + 1);
		})(document.body[key], 0);

		if (done) observer.disconnect();
	}

	const observer = new MutationObserver(applyPatch);
	observer.observe(document.body, { childList: true, subtree: true });

	applyPatch();
})();
