import { state } from "./state.js";
import { t, ti } from "./i18n.js";
import { scheduleSave } from "./dirty.js";

export function rebuildExperimentsConfig(container) {
	const experiments = {};
	container
		.querySelectorAll(".experiments-row:not(.experiments-row--locked)")
		.forEach((row) => {
			const name = row.querySelector(".experiments-name").value.trim();
			if (!name) return;
			const val = row.querySelector(".experiments-select").value;
			const builtinDefault = row.dataset.builtinDefault;
			const isBuiltin = row.dataset.isBuiltin === "true";
			if (isBuiltin && builtinDefault === val) return;
			experiments[name] = val;
		});
	state.CONFIG.experiments = experiments;
	scheduleSave();
}

export function getBuiltinExperimentDefault(name) {
	return Object.prototype.hasOwnProperty.call(state.BUILTIN_EXPERIMENTS, name)
		? state.BUILTIN_EXPERIMENTS[name]
		: null;
}

export function syncExperimentRowMeta(row, addonLock, name) {
	const meta = row.querySelector(".experiments-meta");
	meta.innerHTML = "";

	const builtinDefault = getBuiltinExperimentDefault(name);
	if (builtinDefault) {
		row.dataset.isBuiltin = "true";
		row.dataset.builtinDefault = builtinDefault;

		const builtinTag = document.createElement("div");
		builtinTag.className = "experiments-builtin-tag";
		builtinTag.textContent = t(
			"settings.experiments.builtin",
			"Built-in Next Music experiment",
		);
		meta.append(builtinTag);
	} else {
		row.dataset.isBuiltin = "false";
		delete row.dataset.builtinDefault;
	}

	if (addonLock) {
		const addonTag = document.createElement("div");
		if (addonLock.isConflict) {
			addonTag.className = "experiments-addon-blocked";
			addonTag.textContent = ti(
				"settings.experiments.blockedBy",
				{ addonName: addonLock.addonName },
				`Blocked — experiments.override is active in ${addonLock.addonName}`,
			);
		} else {
			addonTag.className = "experiments-addon-tag";
			addonTag.textContent = ti(
				"settings.experiments.requiredBy",
				{ addonName: addonLock.addonName },
				`Required by ${addonLock.addonName}`,
			);
		}
		meta.append(addonTag);
	}

	row.classList.toggle("experiments-row--stacked", meta.childElementCount > 0);
}

// meta: { addonLock?: { addonName: string, isConflict: boolean } | null }
export function mkExperimentsRow(name, value, container, meta = {}) {
	const { addonLock = null } = meta;
	const row = document.createElement("div");
	row.className = "experiments-row";

	const mainLine = document.createElement("div");
	mainLine.className = "experiments-row-main";

	const nameInp = document.createElement("input");
	nameInp.type = "text";
	nameInp.className = "inp experiments-name";
	nameInp.placeholder = t("settings.experiments.name", "Experiment name");
	nameInp.value = name;

	const sel = document.createElement("select");
	sel.className = "sel experiments-select";
	["unset", "default", "on"].forEach((opt) => {
		const o = document.createElement("option");
		o.value = opt;
		o.textContent = opt;
		if (opt === value) o.selected = true;
		sel.append(o);
	});

	if (addonLock) {
		row.classList.add("experiments-row--locked");
		if (addonLock.isConflict) row.classList.add("experiments-row--conflict");

		nameInp.disabled = true;
		sel.disabled = true;
		mainLine.append(nameInp, sel);
	} else {
		const delBtn = document.createElement("button");
		delBtn.className = "btn experiments-del";
		delBtn.textContent = "×";

		const onChange = () => {
			syncExperimentRowMeta(row, addonLock, nameInp.value.trim());
			rebuildExperimentsConfig(container);
		};
		nameInp.addEventListener("input", onChange);
		sel.addEventListener("change", onChange);
		delBtn.addEventListener("click", () => {
			row.remove();
			rebuildExperimentsConfig(container);
		});

		mainLine.append(nameInp, sel, delBtn);
	}

	const metaWrap = document.createElement("div");
	metaWrap.className = "experiments-meta";

	row.append(mainLine, metaWrap);
	syncExperimentRowMeta(row, addonLock, name);

	return row;
}

export function renderExperimentsPanel(panel) {
	const toolbar = document.createElement("div");
	toolbar.className = "experiments-toolbar";

	const searchInp = document.createElement("input");
	searchInp.type = "text";
	searchInp.className = "inp experiments-search";
	searchInp.placeholder = t("settings.experiments.search", "Search…");

	const addBtn = document.createElement("button");
	addBtn.className = "btn experiments-add-btn";
	addBtn.textContent = "+";

	toolbar.append(searchInp, addBtn);
	panel.append(toolbar);

	const rowsWrap = document.createElement("div");
	rowsWrap.className = "experiments-rows";
	panel.append(rowsWrap);

	// Build flat map: experimentName -> { addonName, value } (first addon wins)
	const addonOverrideMap = new Map();
	for (const { addonName, experiments } of state.ADDON_EXPERIMENTS) {
		for (const [name, value] of Object.entries(experiments)) {
			if (!addonOverrideMap.has(name)) {
				addonOverrideMap.set(name, { addonName, value });
			}
		}
	}

	const userOverrides = state.CONFIG.experiments || {};
	const builtinEntries = Object.entries(state.BUILTIN_EXPERIMENTS || {});

	// User experiments — locked if addon overrides them
	for (const [name, val] of Object.entries(userOverrides)) {
		const addonLock = addonOverrideMap.get(name);
		if (addonLock) {
			rowsWrap.append(
				mkExperimentsRow(name, addonLock.value, rowsWrap, {
					addonLock: { addonName: addonLock.addonName, isConflict: true },
				}),
			);
		} else {
			rowsWrap.append(mkExperimentsRow(name, val, rowsWrap));
		}
	}

	// Addon-only experiments (not set by user or builtin)
	for (const [name, { addonName, value }] of addonOverrideMap) {
		if (!(name in userOverrides) && !getBuiltinExperimentDefault(name)) {
			rowsWrap.append(
				mkExperimentsRow(name, value, rowsWrap, {
					addonLock: { addonName, isConflict: false },
				}),
			);
		}
	}

	searchInp.addEventListener("input", () => {
		const q = searchInp.value.toLowerCase().trim();
		rowsWrap.querySelectorAll(".experiments-row").forEach((row) => {
			const n = row.querySelector(".experiments-name").value.toLowerCase();
			row.classList.toggle("hidden", q !== "" && !n.includes(q));
		});
	});

	addBtn.addEventListener("click", () => {
		const row = mkExperimentsRow("", "unset", rowsWrap);
		rowsWrap.append(row);
		row.querySelector(".experiments-name").focus();
	});
}
