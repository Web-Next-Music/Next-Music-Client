function readSvgAttrs(el) {
	const out = {};
	for (const attr of el.attributes) out[attr.name] = attr.value;
	delete out.class;
	return out;
}

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

let _navLabel = "";
let _navOnOpen = null;

const _navFeature = createPortalFeature({
	id: "nextStoreNav",
	useSiteContext: false,
	findMount() {
		const list = findNavList();
		if (!list) return null;
		if (!readNavTemplate(list)) return null;
		return list;
	},
	isAttached(list) {
		return !!list.querySelector('a[href="' + STORE_ROUTE + '"]');
	},
	buildElement({ React, mountEl }) {
		const template = readNavTemplate(mountEl);
		const NextStoreNavItem = createNavItem(
			React,
			mountEl,
			template,
			_navLabel,
			_navOnOpen,
		);
		return React.createElement(NextStoreNavItem);
	},
});

function mountNextStoreNavItem(label, onOpen) {
	_navLabel = label;
	_navOnOpen = onOpen;
	return _navFeature.mount();
}

function unmountNextStoreNavItem() {
	_navFeature.unmount();
}
