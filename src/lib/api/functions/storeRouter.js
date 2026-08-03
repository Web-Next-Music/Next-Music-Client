const STORE_ROUTE = window.nmcStore?.route || "/next-store";
const STORE_ROUTE_EVENT = "nmc:route";

let _routerHooked = false;

function isStoreRoute() {
	return location.pathname === STORE_ROUTE;
}

function emitRouteChange() {
	window.dispatchEvent(new Event(STORE_ROUTE_EVENT));
}

function hookRouter() {
	if (_routerHooked) return;
	_routerHooked = true;

	for (const name of ["pushState", "replaceState"]) {
		const original = history[name];
		history[name] = function (...args) {
			const before = location.pathname;
			const result = original.apply(this, args);
			if (location.pathname !== before) emitRouteChange();
			return result;
		};
	}

	window.addEventListener("popstate", emitRouteChange);
}

function navigateToStore() {
	hookRouter();
	if (isStoreRoute()) return;
	history.pushState({}, "", STORE_ROUTE);
}

function onRouteChange(listener) {
	hookRouter();
	window.addEventListener(STORE_ROUTE_EVENT, listener);
	return () => window.removeEventListener(STORE_ROUTE_EVENT, listener);
}
