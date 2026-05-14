import "./style.scss";

import { state } from "./modules/state.js";
import { applyI18n } from "./modules/i18n.js";
import { refresh } from "./modules/ui.js";

// Titlebar — maximize / restore
const ICON_EXPAND = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
</svg>`;

const ICON_RESTORE = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
</svg>`;

export function toggleMaximize() {
	window.electronAPI?.toggleMaximize?.();
}

window.electronAPI?.onMaximizeChange?.((maximized) => {
	state.isMaximized = maximized;
	const btn = document.getElementById("tb-maximize");
	if (btn) btn.innerHTML = maximized ? ICON_RESTORE : ICON_EXPAND;
});

async function init() {
	const [
		cfg,
		strings,
		langList,
		addonExps,
		builtinExps,
		starResult,
		tokenResult,
	] = await Promise.all([
		window.electronAPI?.loadConfig().catch(() => ({})),
		window.electronAPI?.loadLangStrings?.().catch(() => null),
		window.electronAPI?.getLangList?.().catch(() => []),
		window.electronAPI?.getAddonExperiments?.().catch(() => []),
		window.electronAPI?.getBuiltinExperiments?.().catch(() => ({})),
		window.electronAPI
			?.getGitHubStarStatus?.()
			.catch(() => ({ hasStarred: false })),
		window.electronAPI
			?.getGitHubHasToken?.()
			.catch(() => ({ hasToken: false })),
	]);

	state.CONFIG = cfg || {};
	state.ORIGINAL_CONFIG = JSON.parse(JSON.stringify(state.CONFIG));
	state.STRINGS = strings || {};
	state.LANGLIST = Array.isArray(langList) ? langList : [];
	state.ADDON_EXPERIMENTS = Array.isArray(addonExps) ? addonExps : [];
	state.BUILTIN_EXPERIMENTS =
		builtinExps && typeof builtinExps === "object" ? builtinExps : {};
	state.HAS_STARRED = starResult?.hasStarred ?? false;

	if (!state.CONFIG.github) state.CONFIG.github = {};
	state.CONFIG.github.accessToken = tokenResult?.hasToken
		? "__has_token__"
		: null;

	const versions = await window.electronAPI?.getVersions?.().catch(() => null);
	if (versions) {
		const set = (id, val) => {
			const el = document.getElementById(id);
			if (el && val) el.textContent = val;
		};
		set("ver-app", versions.app);
		set("ver-electron", versions.electron);
		set("ver-chromium", versions.chromium);
		set("ver-node", versions.node);
	}

	refresh();

	window.electronAPI?.onLanguageChange?.((newStrings) => {
		state.STRINGS = newStrings || {};
		refresh();
	});
}

// Expose to HTML onclick attributes
window.toggleMaximize = toggleMaximize;

init();
