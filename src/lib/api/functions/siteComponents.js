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

let _siteContexts = null;
let _siteContextsPath = null;
let _siteErrorBoundary = null;

const ANCHOR_SELECTORS = [
	"nav a",
	"nav button",
	"main a",
	"main button",
	"a[href]",
	"button",
];

const ANCHOR_SCAN_LIMIT = 20;

function providerChainFrom(fiber) {
	const chain = [];
	const seen = new Set();

	for (let f = fiber; f; f = f.return) {
		if (f.tag !== 10) continue;

		const context = f.type?._context ?? f.type;
		if (!context || seen.has(context)) continue;

		seen.add(context);
		chain.push({ context, value: f.memoizedProps?.value });
	}

	return chain;
}

function captureSiteContexts() {
	let best = [];

	for (const selector of ANCHOR_SELECTORS) {
		let scanned = 0;

		for (const el of document.querySelectorAll(selector)) {
			if (scanned++ >= ANCHOR_SCAN_LIMIT) break;

			const fiber = fiberOf(el);
			if (!fiber) continue;

			const chain = providerChainFrom(fiber);
			if (chain.length > best.length) best = chain;
		}

		if (best.length) break;
	}

	return best;
}

function getSiteContexts(options) {
	const path = location.pathname;

	if (options?.refresh || !_siteContexts || _siteContextsPath !== path) {
		_siteContexts = captureSiteContexts();
		_siteContextsPath = path;
	}

	return _siteContexts;
}

function wrapWithSiteContexts(element, contexts) {
	const { React } = getSiteComponents();
	if (!React) return element;

	let node = element;

	for (const entry of contexts ?? getSiteContexts()) {
		const Provider = entry.context?.Provider ?? entry.context;
		if (!Provider) continue;
		node = React.createElement(Provider, { value: entry.value }, node);
	}

	return node;
}

function getSiteErrorBoundary(React) {
	if (_siteErrorBoundary) return _siteErrorBoundary;

	class SiteContextBoundary extends React.Component {
		constructor(props) {
			super(props);
			this.state = { error: null };
		}

		static getDerivedStateFromError(error) {
			return { error };
		}

		componentDidCatch(error) {
			if (typeof this.props.onError === "function") {
				this.props.onError(error);
			} else {
				console.error("[siteComponents] render failed:", error);
			}
		}

		render() {
			if (!this.state.error) return this.props.children;
			return this.props.fallback ?? null;
		}
	}

	_siteErrorBoundary = SiteContextBoundary;
	return _siteErrorBoundary;
}

function getComponentFromElement(selector, predicate, options = {}) {
	const maxDepth = options.maxDepth ?? 8;
	const nodes =
		typeof selector === "string"
			? document.querySelectorAll(selector)
			: selector
				? [selector]
				: [];

	for (const el of nodes) {
		let fiber = fiberOf(el);

		for (let d = 0; d < maxDepth && fiber; d++, fiber = fiber.return) {
			const type = fiber.type;
			const usable =
				typeof type === "function" ||
				(type && typeof type === "object" && type.$$typeof);
			if (!usable) continue;

			if (predicate) {
				let matched = false;
				try {
					matched = predicate(type, fiber);
				} catch {}
				if (!matched) continue;
			} else if (typeof type !== "function") {
				continue;
			}

			return {
				component: type,
				props: fiber.memoizedProps,
				contexts: providerChainFrom(fiber.return),
			};
		}
	}

	return null;
}

function renderInSiteContext(element, host, options = {}) {
	const { React, ReactDOMClient } = getSiteComponents();
	if (!React || !ReactDOMClient || !host) return null;

	const Boundary = getSiteErrorBoundary(React);
	const root = ReactDOMClient.createRoot(host);
	let generation = 0;

	const handle = {
		root,
		host,
		render(next) {
			generation += 1;
			const tree =
				options.withContexts === false
					? next
					: wrapWithSiteContexts(next, options.contexts);

			root.render(
				React.createElement(
					Boundary,
					{
						key: generation,
						onError: options.onError,
						fallback: options.fallback,
					},
					tree,
				),
			);

			return handle;
		},
		unmount() {
			root.unmount();
		},
	};

	return handle.render(element);
}
