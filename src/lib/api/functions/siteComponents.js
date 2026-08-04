let _siteComponents = null;

function fnBody(fn) {
	try {
		return fn.toString();
	} catch {
		return "";
	}
}

function firstDestructureKeys(src) {
	const m = /(?:let|var|const)\s*\{([^}]*)\}\s*=/.exec(src);
	return m ? m[1] : "";
}

function hasKeys(src, ...words) {
	return words.every((w) => new RegExp("\\b" + w + "\\b").test(src));
}

function isReactMod(m) {
	return (
		typeof m.createElement === "function" &&
		typeof m.Children === "object" &&
		typeof m.useEffect === "function" &&
		typeof m.useState === "function"
	);
}

const MODULE_SLOTS = {
	React: { module: isReactMod },
	ReactDOMClient: { module: (m) => typeof m.createRoot === "function" },
	ReactDOMPortal: { module: (m) => typeof m.createPortal === "function" },
	JsxRuntime: {
		module: (m) =>
			typeof m.jsx === "function" && typeof m.jsxs === "function",
		raw: true,
	},
	TabCarousel: {
		export: (fn) => fnBody(fn).includes("TAB_CAROUSEL"),
	},
	Tab: {
		export: (fn) => {
			const src = fnBody(fn);
			return src.includes("onTabChange") && src.includes("-tabpanel");
		},
	},
	TabWithTitle: {
		export: (fn) =>
			hasKeys(
				firstDestructureKeys(fnBody(fn)),
				"title",
				"subtitle",
				"covers",
				"withCovers",
			),
	},
};

const FIBER_SLOTS = {
	Button: {
		selector: "button",
		test: (fn) =>
			hasKeys(
				firstDestructureKeys(fnBody(fn)),
				"isBlock",
				"iconPosition",
				"withRipple",
			),
	},
	SearchInput: {
		selector: "input",
		test: (fn) =>
			hasKeys(
				firstDestructureKeys(fnBody(fn)),
				"initialValue",
				"withResetButton",
			),
	},
	Input: {
		selector: "input",
		test: (fn) =>
			hasKeys(
				firstDestructureKeys(fnBody(fn)),
				"containerClassName",
				"inputClassName",
				"actions",
			),
	},
};

function scanModules(found) {
	const req = getAppRequire();
	if (!req?.m) return;

	const pending = Object.entries(MODULE_SLOTS).filter(
		([name]) => !found[name],
	);
	if (!pending.length) return;

	for (const id of Object.keys(req.m)) {
		let mod;
		try {
			mod = req(id);
		} catch {
			continue;
		}
		if (!mod) continue;

		for (const [name, slot] of pending) {
			if (found[name]) continue;

			if (slot.module) {
				if (slot.module(mod)) found[name] = mod;
				continue;
			}

			let keys;
			try {
				keys = Object.keys(mod);
			} catch {
				continue;
			}

			for (const key of keys) {
				let value;
				try {
					value = mod[key];
				} catch {
					continue;
				}
				const fn =
					typeof value === "function" ? value : value && value.render;
				if (typeof fn === "function" && slot.export(fn)) {
					found[name] = value;
					break;
				}
			}
		}
	}
}

function fiberOf(el) {
	const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
	return key ? el[key] : null;
}

function harvestFromFiber(selector, test, maxDepth = 8) {
	for (const el of document.querySelectorAll(selector)) {
		let fiber = fiberOf(el);
		for (let d = 0; d < maxDepth && fiber; d++, fiber = fiber.return) {
			if (typeof fiber.type === "function" && test(fiber.type)) {
				return fiber.type;
			}
		}
	}
	return null;
}

function scanFibers(found) {
	for (const [name, slot] of Object.entries(FIBER_SLOTS)) {
		if (found[name]) continue;
		const component = harvestFromFiber(slot.selector, slot.test);
		if (component) found[name] = component;
	}
}

function getSiteComponents(options) {
	if (options?.refresh) _siteComponents = null;
	if (_siteComponents) {
		const missing = Object.keys({
			...MODULE_SLOTS,
			...FIBER_SLOTS,
		}).filter((n) => !_siteComponents[n]);
		if (!missing.length) return _siteComponents;
	}

	const found = _siteComponents || {};

	try {
		scanModules(found);
	} catch {}

	try {
		scanFibers(found);
	} catch {}

	_siteComponents = found;
	return found;
}

function getMissingSiteComponents() {
	const found = _siteComponents || {};
	return Object.keys({ ...MODULE_SLOTS, ...FIBER_SLOTS }).filter(
		(n) => !found[n],
	);
}
