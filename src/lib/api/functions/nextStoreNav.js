function readSvgAttrs(el) {
	const out = {};
	for (const attr of el.attributes) out[attr.name] = attr.value;
	delete out.class;
	return out;
}

let _navRoot = null;
let _navHost = null;
let _navList = null;
let _navBodyObserver = null;
let _navRenderPending = false;

function findNavList() {
	return document.querySelector('[class*="NavbarDesktop_navigation"] > ol');
}

function findNavItemFiber(li) {
	let fiber = fiberOf(li);
	for (let d = 0; d < 4 && fiber; d++, fiber = fiber.return) {
		if (
			typeof fiber.type === "function" &&
			fiber.memoizedProps &&
			fiber.memoizedProps.shownAnimation !== undefined
		) {
			return fiber;
		}
	}
	return null;
}

function findSearchIcon(list) {
	for (const anchor of list.querySelectorAll("li a")) {
		const href = anchor.getAttribute("href") || "";
		const label = anchor.textContent || "";
		if (!/search/i.test(href) && !/search/i.test(label)) continue;

		const svg = anchor.querySelector("svg");
		if (svg) return svg;
	}
	return null;
}

function readNavTemplate(list) {
	const searchSvg = findSearchIcon(list);

	for (const li of list.querySelectorAll("li")) {
		const anchor = li.querySelector("a");
		if (!anchor || anchor.children.length !== 2) continue;
		if (anchor.getAttribute("href") === STORE_ROUTE) continue;

		const iconWrap = anchor.children[0];
		const labelWrap = anchor.children[1];
		const svg = iconWrap.querySelector("svg");
		const span = labelWrap.querySelector("span");
		if (!svg || !span || svg.parentElement !== iconWrap) continue;

		const fiber = findNavItemFiber(li);
		if (!fiber) continue;

		const iconSvg = searchSvg || svg;

		return {
			sourceLi: li,
			NavItem: fiber.type,
			navProps: fiber.memoizedProps,
			itemClass: li.className,
			anchorClass: anchor.className,
			iconClass: iconSvg.getAttribute("class") || "",
			iconSvgAttrs: readSvgAttrs(iconSvg),
			iconInnerHTML: iconSvg.innerHTML,
			labelClass: span.className,
		};
	}

	return null;
}

function createNavItem(React, list, initialTemplate, label, onOpen) {
	return function NextStoreNavItem() {
		const [template, setTemplate] = React.useState(initialTemplate);
		const [selected, setSelected] = React.useState(isStoreRoute());

		React.useEffect(
			() => onRouteChange(() => setSelected(isStoreRoute())),
			[],
		);

		React.useEffect(() => {
			const sourceLi = initialTemplate.sourceLi;
			if (!sourceLi) return;

			const sync = () => {
				const fresh = readNavTemplate(list);
				if (fresh) setTemplate(fresh);
			};

			const attrObserver = new MutationObserver(sync);
			attrObserver.observe(sourceLi, {
				subtree: true,
				attributes: true,
				attributeFilter: ["class"],
			});

			const structureObserver = new MutationObserver(() => {
				if (!sourceLi.isConnected) sync();
			});
			structureObserver.observe(list, { childList: true });

			return () => {
				attrObserver.disconnect();
				structureObserver.disconnect();
			};
		}, []);

		const { NavItem, navProps } = template;
		const baseNavProps = { ...navProps };
		delete baseNavProps.children;
		delete baseNavProps.forwardRef;

		const anchor = React.createElement(
			"a",
			{
				className: template.anchorClass,
				href: STORE_ROUTE,
				role: "link",
				target: "_self",
				rel: "",
				tabIndex: 0,
				"aria-disabled": false,
				onClick: (event) => {
					event.preventDefault();
					onOpen();
				},
			},
			[
				React.createElement("svg", {
					key: "icon",
					...template.iconSvgAttrs,
					className: template.iconClass,
					focusable: "false",
					"aria-hidden": true,
					dangerouslySetInnerHTML: { __html: template.iconInnerHTML },
				}),
				React.createElement(
					"span",
					{
						key: "label",
						className: template.labelClass,
						title: label,
						style: { WebkitLineClamp: 1 },
					},
					label,
				),
			],
		);

		return React.createElement(NavItem, {
			...baseNavProps,
			className: template.itemClass,
			selected,
			children: anchor,
		});
	};
}

function isNavItemAttached() {
	return (
		!!_navList &&
		_navList.isConnected &&
		!!_navList.querySelector('a[href="' + STORE_ROUTE + '"]')
	);
}

function renderNavItem(label, onOpen) {
	const { React, ReactDOMClient, ReactDOMPortal } = getSiteComponents();
	if (!React || !ReactDOMClient || !ReactDOMPortal) return false;

	const list = findNavList();
	if (!list) return false;

	const template = readNavTemplate(list);
	if (!template) return false;

	unmountNextStoreNavItem();

	_navHost = document.createElement("div");
	_navHost.style.display = "none";
	document.body.appendChild(_navHost);

	const NextStoreNavItem = createNavItem(
		React,
		list,
		template,
		label,
		onOpen,
	);

	_navList = list;
	_navRoot = ReactDOMClient.createRoot(_navHost);
	_navRoot.render(
		ReactDOMPortal.createPortal(
			React.createElement(NextStoreNavItem),
			list,
		),
	);

	return true;
}

function scheduleNavRecheck(label, onOpen) {
	if (_navRenderPending) return;
	_navRenderPending = true;
	requestAnimationFrame(() => {
		_navRenderPending = false;
		if (!isNavItemAttached()) renderNavItem(label, onOpen);
	});
}

function mountNextStoreNavItem(label, onOpen) {
	if (isNavItemAttached()) return true;
	if (!renderNavItem(label, onOpen)) return false;

	if (!_navBodyObserver) {
		_navBodyObserver = new MutationObserver(() =>
			scheduleNavRecheck(label, onOpen),
		);
		_navBodyObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	return true;
}

function unmountNextStoreNavItem() {
	if (_navRoot) {
		_navRoot.unmount();
		_navRoot = null;
	}
	if (_navHost) {
		_navHost.remove();
		_navHost = null;
	}
	_navList = null;
}
