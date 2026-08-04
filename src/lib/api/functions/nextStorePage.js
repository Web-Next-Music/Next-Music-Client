const OPTIONAL_SLOTS = ["TabCarousel", "Tab", "TabWithTitle", "SearchInput"];

let _storeHost = null;
let _storeRoot = null;

function findContentArea() {
	return (
		document.querySelector('[class*="CommonLayout_content"] main') ||
		document.querySelector("main")
	);
}

function lower(value) {
	return String(value).toLowerCase();
}

function loadStoreSections() {
	return Promise.all([
		storeJson("GET", "/api/section/Addons", {}).catch(() => []),
		storeJson("GET", "/api/section/Themes", {}).catch(() => []),
		storeJson("GET", "/api/custom", { known: "[]" }).catch(() => []),
	]).then(([addons, themes, installed]) => ({ addons, themes, installed }));
}

async function fetchUpdates(loaded) {
	const installedNames = new Set(
		(loaded.installed || []).map((i) => lower(i.name)),
	);

	const items = [...(loaded.addons || []), ...(loaded.themes || [])]
		.filter(
			(i) => i.submodule && i.subUrl && installedNames.has(lower(i.name)),
		)
		.map((i) => ({ name: i.name, subUrl: i.subUrl }));

	if (!items.length) return {};

	const results = await storeJson(
		"POST",
		"/api/check-updates",
		{},
		JSON.stringify({ items }),
	);

	const updates = {};
	for (const entry of results || []) {
		if (entry.hasUpdate) updates[lower(entry.name)] = true;
	}
	return updates;
}

function buildSections(data) {
	const catalogByName = new Map();
	for (const entry of [...(data.addons || []), ...(data.themes || [])]) {
		catalogByName.set(lower(entry.name), entry);
	}

	const installedByName = new Map(
		(data.installed || []).map((i) => [lower(i.name), i]),
	);

	const decorate = (list, section) =>
		(list || []).map((i) => {
			const local = installedByName.get(lower(i.name));
			return {
				...i,
				section,
				installed: !!local,
				enabled: local ? local.enabled : false,
			};
		});

	return {
		addons: decorate(data.addons, "Addons"),
		themes: decorate(data.themes, "Themes"),
		installed: (data.installed || []).map((i) => {
			const catalog = catalogByName.get(lower(i.name));
			return { ...catalog, ...i, installed: true, isLocal: !catalog };
		}),
	};
}

function runStoreAction(action, item) {
	if (action === "toggle") {
		return storeJson(
			"POST",
			"/api/toggle",
			{},
			JSON.stringify({ name: item.name }),
		);
	}

	if (action === "delete") {
		return storeJson(
			"POST",
			"/api/delete",
			{},
			JSON.stringify({ name: item.name }),
		);
	}

	return storeJson(
		"POST",
		"/api/download",
		{},
		JSON.stringify({
			name: item.name,
			folderPath: item.path,
			section: item.section,
			submodule: item.submodule,
			subUrl: item.subUrl,
			releaseCache: readReleaseCache(),
		}),
	);
}

function useStoreData(React) {
	const [data, setData] = React.useState({
		addons: null,
		themes: null,
		installed: null,
	});
	const [updates, setUpdates] = React.useState({});

	const reload = React.useCallback(
		() => loadStoreSections().then((loaded) => (setData(loaded), loaded)),
		[],
	);

	React.useEffect(() => {
		reload().then((loaded) =>
			fetchUpdates(loaded)
				.then(setUpdates)
				.catch(() => {}),
		);
	}, [reload]);

	return { data, updates, setUpdates, reload };
}

function useRateLimit(React) {
	const [rateLimit, setRateLimit] = React.useState(null);

	React.useEffect(() => {
		storeJson("GET", "/api/rate-limit", {})
			.then((res) => {
				if (!res.limited) return;
				const minutes = Math.max(
					1,
					Math.ceil((res.resetAt - Date.now()) / 60000),
				);
				setRateLimit(minutes);
			})
			.catch(() => {});
	}, []);

	return rateLimit;
}

function renderTabs(components, tab, setTab, counts) {
	const { React, TabCarousel, Tab, TabWithTitle } = components;
	const h = React.createElement;

	const defs = [
		["addons", t("tabAddons")],
		["themes", t("tabThemes")],
		["installed", t("tabInstalled")],
	];

	const labelOf = (value, label) => label + " • " + counts[value];

	if (!TabCarousel) {
		return h(
			"div",
			{ className: "nmc-tabs" },
			defs.map(([value, label]) =>
				h(
					"button",
					{
						key: value,
						type: "button",
						className: tab === value ? "nmc-tab active" : "nmc-tab",
						onClick: () => setTab(value),
					},
					labelOf(value, label),
				),
			),
		);
	}

	const TabComponent = TabWithTitle || Tab;

	return h(
		TabCarousel,
		{ value: tab, onTabChange: setTab, elementId: "nmc-store" },
		defs.map(([value, label]) =>
			h(TabComponent, {
				key: value,
				value,
				active: tab === value,
				onTabChange: setTab,
				title: labelOf(value, label),
				children: TabWithTitle ? undefined : labelOf(value, label),
			}),
		),
	);
}

function renderSearch(components, query, setQuery) {
	const { React, SearchInput } = components;
	const h = React.createElement;

	const onQuery = (value) =>
		setQuery(
			typeof value === "string" ? value : (value?.target?.value ?? ""),
		);

	if (!SearchInput) {
		return h("input", {
			className: "nmc-search",
			type: "text",
			value: query,
			placeholder: t("searchPlaceholder"),
			onChange: onQuery,
		});
	}

	return h(SearchInput, {
		placeholder: t("searchPlaceholder"),
		initialValue: query,
		withResetButton: true,
		onChange: onQuery,
	});
}

function createStoreApp(components) {
	const { React } = components;
	const h = React.createElement;

	const StoreButton = createStoreButton(React);
	const Card = createStoreCard(React, StoreButton);
	const EditorModal = createEditorModal(React, StoreButton);
	const ReadmeModal = createReadmeModal(React, StoreButton);

	const renderBanner = (key, text, action) =>
		h(
			"div",
			{ className: "nmc-banner", key },
			storeIcon(React, "warning", { key: "icon" }),
			h("span", { key: "text" }, text),
			action,
		);

	return function StoreApp() {
		const [tab, setTab] = React.useState("addons");
		const [query, setQuery] = React.useState("");
		const [restartNeeded, setRestartNeeded] = React.useState(false);
		const [readme, setReadme] = React.useState(null);
		const [editor, setEditor] = React.useState(null);
		const [, setLangReady] = React.useState(0);

		const { data, updates, setUpdates, reload } = useStoreData(React);
		const rateLimit = useRateLimit(React);

		React.useEffect(() => {
			loadStoreLang().then(() => setLangReady((n) => n + 1));
		}, []);

		const onAction = React.useCallback(
			async (action, item) => {
				const res = await runStoreAction(action, item);

				if (action === "download" || action === "update") {
					syncReleaseCache(res.releaseInfo);
				}

				if (action === "update") {
					setUpdates((prev) => {
						const next = { ...prev };
						delete next[lower(item.name)];
						return next;
					});
				}

				setRestartNeeded(true);
				await reload();
			},
			[reload, setUpdates],
		);

		const onReadme = React.useCallback((item) => setReadme(item), []);

		const onSettings = React.useCallback(
			(item) => setEditor(item.name),
			[],
		);

		const modals = [
			editor
				? h(EditorModal, {
						key: "editor",
						name: editor,
						onClose: () => setEditor(null),
					})
				: null,
			readme
				? h(ReadmeModal, {
						key: "readme",
						item: readme,
						onClose: () => setReadme(null),
					})
				: null,
		];

		const sections = buildSections(data);
		const counts = {
			addons: (data.addons || []).length,
			themes: (data.themes || []).length,
			installed: (data.installed || []).length,
		};

		const needle = query.trim().toLowerCase();
		const all = sections[tab] || [];
		const items = needle
			? all.filter((i) => lower(i.name).includes(needle))
			: all;

		const banners = [];
		if (rateLimit) {
			banners.push(
				renderBanner(
					"rate",
					t("statusRateLimited", { minutes: rateLimit }),
				),
			);
		}
		if (restartNeeded) {
			banners.push(
				renderBanner(
					"restart",
					t("statusRestartRequired"),
					h(StoreButton, {
						key: "btn",
						variant: "primary",
						label: t("btnRestart"),
						onClick: () => {
							storeJson("POST", "/api/reload", {}).catch(
								() => {},
							);
						},
					}),
				),
			);
		}

		let body;
		if (data[tab] === null) {
			body = h("div", { className: "nmc-empty" }, t("statusLoading"));
		} else if (!items.length) {
			body = h(
				"div",
				{ className: "nmc-empty" },
				needle
					? t("searchNoResults", { query })
					: t("statusEmptyInstalled"),
			);
		} else {
			body = h(
				"div",
				{ className: "nmc-grid" },
				items.map((item) =>
					h(Card, {
						key: item.name,
						item,
						section: tab,
						hasUpdate: !!updates[lower(item.name)],
						onAction,
						onReadme,
						onSettings,
					}),
				),
			);
		}

		return h(
			"div",
			null,
			h(
				"div",
				{ className: "nmc-head" },
				h(
					"div",
					{ className: "nmc-title" },
					"Next Music ",
					h("span", null, "Store"),
				),
			),
			h("div", null, renderTabs(components, tab, setTab, counts)),
			h(
				"div",
				{ className: "nmc-toolbar" },
				renderSearch(components, query, setQuery),
			),
			body,
			banners,
			modals,
		);
	};
}

function missingOptionalSlots(components) {
	return OPTIONAL_SLOTS.filter((name) => !components[name]).join(",");
}

function createStoreRoot(initialComponents) {
	const { React } = initialComponents;

	return function StoreRoot() {
		const [active, setActive] = React.useState(isStoreRoute());
		const [components, setComponents] = React.useState(initialComponents);

		React.useEffect(() => {
			if (!active) return;
			if (!missingOptionalSlots(components)) return;

			const refreshed = getSiteComponents({ refresh: true });
			if (
				missingOptionalSlots(refreshed) !==
				missingOptionalSlots(components)
			) {
				setComponents({ ...refreshed });
			}
		}, [active, components]);

		const StoreApp = React.useMemo(
			() => createStoreApp(components),
			[components],
		);

		React.useEffect(
			() => onRouteChange(() => setActive(isStoreRoute())),
			[],
		);

		React.useEffect(() => {
			const main = findContentArea();
			if (!main) return undefined;

			if (!active) {
				main.classList.remove(STORE_ACTIVE_CLASS);
				_storeHost.remove();
				releaseObjectUrls();
				return undefined;
			}

			const attach = () => {
				main.classList.add(STORE_ACTIVE_CLASS);
				if (_storeHost.parentElement !== main) {
					main.appendChild(_storeHost);
				}
			};

			attach();
			const timer = setInterval(attach, 500);
			return () => clearInterval(timer);
		}, [active]);

		return active ? React.createElement(StoreApp) : null;
	};
}

function ensureNextStoreMounted() {
	if (_storeRoot) return true;

	const components = getSiteComponents({ refresh: true });
	if (!components.React || !components.ReactDOMClient) return false;
	if (!findContentArea()) return false;

	ensureStoreStyle();
	hookRouter();

	_storeHost = document.createElement("div");
	_storeHost.id = STORE_ROOT_ID;

	const StoreRoot = createStoreRoot(components);
	_storeRoot = components.ReactDOMClient.createRoot(_storeHost);
	_storeRoot.render(components.React.createElement(StoreRoot));

	return true;
}

function openNextStore() {
	if (!ensureNextStoreMounted()) return false;
	navigateToStore();
	return true;
}
