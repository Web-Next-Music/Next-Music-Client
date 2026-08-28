let _navRoot = null;
let _navHost = null;
let _navList = null;
let _navBodyObserver = null;
let _navRenderPending = false;
let _navRender = null;

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

function readNavItemElements(li) {
	const { React } = getSiteComponents();
	if (!React) return null;

	const navFiber = findNavItemFiber(li);
	const link = navFiber?.memoizedProps?.children;
	if (!link || typeof link !== "object" || !link.props) return null;

	const parts = React.Children.toArray(link.props.children);
	if (parts.length !== 2) return null;

	return {
		NavItem: navFiber.type,
		navProps: navFiber.memoizedProps,
		link,
		icon: parts[0],
		label: parts[1],
	};
}

function readNavIcon(list) {
	for (const li of list.querySelectorAll("li")) {
		const anchor = li.querySelector("a");
		if (!anchor) continue;

		const href = anchor.getAttribute("href") || "";
		const text = anchor.textContent || "";
		if (!/search/i.test(href) && !/search/i.test(text)) continue;

		const parts = readNavItemElements(li);
		if (parts) return parts.icon;
	}

	return null;
}

function readNavTemplate(list) {
	for (const li of list.querySelectorAll("li")) {
		const anchor = li.querySelector("a");
		if (!anchor || anchor.children.length !== 2) continue;
		if (anchor.getAttribute("href") === STORE_ROUTE) continue;

		const parts = readNavItemElements(li);
		if (!parts) continue;

		return {
			...parts,
			sourceLi: li,
			itemClass: li.className,
			icon: readNavIcon(list) ?? parts.icon,
		};
	}

	return null;
}

function labelClassOf(template) {
	return template?.label?.props?.className ?? "";
}

function createNavItem(React, list, initialTemplate, label, onOpen) {
	return function NextStoreNavItem() {
		const [template, setTemplate] = React.useState(initialTemplate);
		const [selected, setSelected] = React.useState(isStoreRoute());

		React.useEffect(
			() => onRouteChange(() => setSelected(isStoreRoute())),
			[],
		);

		const templateRef = React.useRef(initialTemplate);

		React.useEffect(() => {
			const sync = () => {
				const fresh = readNavTemplate(list);
				if (!fresh) return;

				const prev = templateRef.current;
				if (
					prev.itemClass === fresh.itemClass &&
					labelClassOf(prev) === labelClassOf(fresh)
				) {
					return;
				}

				templateRef.current = fresh;
				setTemplate(fresh);
				_navRender?.();
			};

			const resize = new ResizeObserver(sync);
			const observeItems = () => {
				resize.disconnect();
				for (const li of list.querySelectorAll("li")) {
					resize.observe(li);
				}
			};

			const mutations = new MutationObserver(() => {
				observeItems();
				sync();
			});
			mutations.observe(list, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: ["class"],
			});

			observeItems();
			sync();

			return () => {
				mutations.disconnect();
				resize.disconnect();
			};
		}, []);

		const anchor = React.cloneElement(template.link, {
			href: STORE_ROUTE,
			"data-test-id": undefined,
			onClick: (event) => {
				event.preventDefault();
				onOpen();
			},
			children: [
				React.cloneElement(template.icon, { key: "icon" }),
				React.cloneElement(template.label, {
					key: "label",
					children: label,
				}),
			],
		});

		const navProps = { ...template.navProps };
		delete navProps.children;
		delete navProps.forwardRef;

		return React.createElement(template.NavItem, {
			...navProps,
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

	const portal = () =>
		ReactDOMPortal.createPortal(
			React.createElement(NextStoreNavItem),
			list,
		);

	_navRoot = renderInSiteContext(portal(), _navHost, {
		onError: (err) => console.error("[nextStoreNav] render failed:", err),
	});
	_navRender = _navRoot ? () => _navRoot.render(portal()) : null;

	return !!_navRoot;
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
	_navRender = null;
	if (_navHost) {
		_navHost.remove();
		_navHost = null;
	}
	_navList = null;
}
