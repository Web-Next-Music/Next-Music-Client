import { state } from "./state.js";

export function t(key, fallback) {
	return state.STRINGS[key] || fallback || key;
}

export function ti(key, vars, fallback) {
	let str = state.STRINGS[key] || fallback || key;
	for (const [k, v] of Object.entries(vars)) {
		str = str.replace(`{${k}}`, v);
	}
	return str;
}

export function applyI18n() {
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const s = state.STRINGS[el.dataset.i18n];
		if (s) el.textContent = s;
	});
}

export function fieldName(path) {
	const seg = path.split(".").pop();
	return (
		state.STRINGS[`settings.config.${seg}`] ||
		state.STRINGS[`settings.config.${path}`] ||
		seg
	);
}

export function fieldDesc(path) {
	const seg = path.split(".").pop();
	return (
		state.STRINGS[`settings.desc.${seg}`] ||
		state.STRINGS[`settings.desc.${path}`] ||
		null
	);
}

export function sectionName(key) {
	return state.STRINGS[`settings.config.${key}`] || key;
}

export function tabName(key) {
	return state.STRINGS[`settings.config.${key}`] || key;
}
