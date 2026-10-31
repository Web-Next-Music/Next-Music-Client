import { state } from "./state.js";

export function checkDirty() {
	const isDirty =
		JSON.stringify(state.CONFIG) !== JSON.stringify(state.ORIGINAL_CONFIG);
	state.hasPendingChanges = isDirty;
	const btn = document.getElementById("save-restart-btn");
	if (btn) {
		btn.classList.toggle("visible", isDirty || state.restartRequired);
		btn.disabled = state.saving || state.languageSaving > 0;
	}
}

export function scheduleSave() {
	checkDirty();
}

export function showToast() {
	const el = document.getElementById("toast");
	el.classList.add("show");
	clearTimeout(state.toastTimer);
	state.toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}
