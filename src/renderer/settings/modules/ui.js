import { state, STAR_GATED_PATHS } from "./state.js";
import { applyI18n, sectionName, tabName, t } from "./i18n.js";
import { mkToggle, mkRow } from "./controls.js";
import { renderExperimentsPanel } from "./experiments.js";
import { buildGitHubStarBlock } from "./github.js";
import { getPath } from "./utils.js";

const langSelects = [];

export function buildSchema() {
	const tabs = [];

	for (const [tabKey, tabVal] of Object.entries(state.CONFIG)) {
		if (tabKey === "experiments") continue;
		if (tabKey === "github") continue;
		if (typeof tabVal !== "object" || Array.isArray(tabVal) || tabVal === null)
			continue;

		function walkTree(obj, prefix) {
			const nodes = [];
			for (const [k, v] of Object.entries(obj)) {
				const path = prefix ? `${prefix}.${k}` : k;

				if (typeof v === "object" && v !== null && !Array.isArray(v)) {
					nodes.push({
						kind: "group",
						key: k,
						path,
						children: walkTree(v, path),
					});
				} else {
					const field = { kind: "field", path, sectionKey: null };
					if (k === "language") {
						field.type = "select";
						field.optionsFn = () =>
							state.LANGLIST.map((l) => ({ value: l, label: l }));
					} else if (Array.isArray(v)) {
						field.type = "array";
					} else if (typeof v === "boolean") {
						field.type = "bool";
					} else if (typeof v === "number") {
						field.type = "number";
					} else {
						field.type = "string";
					}
					nodes.push(field);
				}
			}
			return nodes;
		}

		const nodes = walkTree(tabVal, tabKey);
		if (nodes.length) tabs.push({ key: tabKey, nodes });
	}

	return tabs;
}

function isStarGated(path) {
	return STAR_GATED_PATHS.some(
		(gated) => path === gated || path.startsWith(gated + "."),
	);
}

function maybeGate(element, path) {
	if (state.HAS_STARRED || !isStarGated(path)) return element;

	element.querySelectorAll("input, select, textarea, button").forEach((el) => {
		el.disabled = true;
	});
	const control = element.querySelector(
		"label.toggle, input.inp, select.sel, textarea.ta",
	);
	if (control) control.classList.add("star-gate-blocked");

	const lbl = element.querySelector(".lbl");
	if (lbl) {
		const notice = document.createElement("div");
		notice.className = "star-gate-notice";
		notice.textContent = t("settings.starGate");
		lbl.append(notice);
	}

	return element;
}

export function renderNodes(nodes, container, depth) {
	depth = depth || 0;
	let lastKind = null;

	nodes.forEach((node) => {
		if (lastKind === "group" && node.kind === "field") {
			const hr = document.createElement("div");
			hr.className = "divider";
			container.append(hr);
		}
		lastKind = node.kind;

		if (node.kind === "field") {
			const { row, control } = mkRow(node);
			container.append(maybeGate(row, node.path));
			if (node.type === "select" && node.path.endsWith("language")) {
				langSelects.push(control);
			}
		} else if (node.kind === "group") {
			const enableFieldIdx = node.children.findIndex(
				(c) => c.kind === "field" && c.path.split(".").pop() === "enable",
			);

			if (depth === 0) {
				if (enableFieldIdx !== -1) {
					const enableField = node.children[enableFieldIdx];
					const remainingChildren = node.children.filter(
						(_, i) => i !== enableFieldIdx,
					);

					const secRow = document.createElement("div");
					secRow.className = "sec-title-row";
					const secLabel = document.createElement("span");
					secLabel.className = "sec-title-label";
					secLabel.textContent = sectionName(node.key);
					secRow.append(secLabel);

					const toggle = mkToggle(enableField.path);
					toggle.classList.add("group-head-toggle");
					secRow.append(toggle);
					container.append(secRow);

					const bodyWrap = document.createElement("div");
					bodyWrap.className = "sec-body-wrap";

					const applyDisabled = () => {
						const enabled = !!getPath(state.CONFIG, enableField.path);
						bodyWrap.classList.toggle("group-body--disabled", !enabled);
					};
					toggle.querySelector("input").addEventListener("change", applyDisabled);
					renderNodes(remainingChildren, bodyWrap, depth + 1);
					applyDisabled();
					container.append(bodyWrap);
				} else {
					const h = document.createElement("div");
					h.className = "sec-title";
					h.textContent = sectionName(node.key);
					container.append(h);
					renderNodes(node.children, container, depth + 1);
				}
			} else {
				const card = document.createElement("div");
				card.className = depth === 1 ? "group-card" : "group-card deep";

				const cardHead = document.createElement("div");
				cardHead.className = "group-card-head";
				const cardTitle = document.createElement("span");
				cardTitle.className = "group-card-title";
				cardTitle.textContent = sectionName(node.key);
				cardHead.append(cardTitle);

				if (enableFieldIdx !== -1) {
					const enableField = node.children[enableFieldIdx];
					const remainingChildren = node.children.filter(
						(_, i) => i !== enableFieldIdx,
					);

					const toggle = mkToggle(enableField.path);
					toggle.classList.add("group-head-toggle");
					cardHead.append(toggle);
					card.append(cardHead);

					const cardBody = document.createElement("div");
					cardBody.className = "group-card-body";

					const applyDisabled = () => {
						const enabled = !!getPath(state.CONFIG, enableField.path);
						cardBody.classList.toggle("group-body--disabled", !enabled);
					};
					toggle
						.querySelector("input")
						.addEventListener("change", applyDisabled);
					renderNodes(remainingChildren, cardBody, depth + 1);
					applyDisabled();
					card.append(cardBody);
				} else {
					card.append(cardHead);
					const cardBody = document.createElement("div");
					cardBody.className = "group-card-body";
					renderNodes(node.children, cardBody, depth + 1);
					card.append(cardBody);
				}

				container.append(card);
			}
		}
	});
}

export function buildUI() {
	const sidebar = document.getElementById("sidebar-nav");
	const content = document.getElementById("content");
	sidebar.innerHTML = "";
	content.innerHTML = "";
	langSelects.length = 0;

	const tabs = buildSchema();
	const hasExperiments = state.CONFIG.experiments !== undefined;

	if (!tabs.length && !hasExperiments) return;

	if (
		!state.activeTab ||
		(!tabs.find((t) => t.key === state.activeTab) &&
			state.activeTab !== "experiments")
	) {
		state.activeTab = tabs.length ? tabs[0].key : "experiments";
	}

	const sidebarFooter = document.getElementById("sidebar-footer");
	const existingSaveBtn = document.getElementById("save-restart-btn");
	if (existingSaveBtn) existingSaveBtn.remove();
	const existingStarBtn = document.getElementById("star-project-btn");
	if (existingStarBtn) existingStarBtn.remove();

	const saveBtn = document.createElement("button");
	saveBtn.id = "save-restart-btn";
	saveBtn.className =
		"save-restart-btn" + (state.hasPendingChanges ? " visible" : "");
	saveBtn.dataset.i18n = "settings.saveRestart";
	saveBtn.textContent = t("settings.saveRestart");
	saveBtn.addEventListener("click", async () => {
		await window.electronAPI?.saveConfig(state.CONFIG);
		state.ORIGINAL_CONFIG = JSON.parse(JSON.stringify(state.CONFIG));
		state.hasPendingChanges = false;
		window.electronAPI?.restartApp?.();
	});

	if (!state.HAS_STARRED) {
		const starBtn = document.createElement("button");
		starBtn.id = "star-project-btn";
		starBtn.className = "star-project-btn";
		starBtn.dataset.i18n = "settings.starProject";
		starBtn.textContent = t("settings.starProject");
		starBtn.addEventListener("click", () => {
			window.electronAPI?.openExternal?.(
				"https://github.com/Web-Next-Music/Next-Music-Client",
			);
		});
		sidebarFooter.prepend(starBtn);
	}

	sidebarFooter.prepend(saveBtn);

	tabs.forEach((tab) => {
		const nav = document.createElement("div");
		nav.className =
			"nav-item" + (tab.key === state.activeTab ? " active" : "");
		nav.textContent = tabName(tab.key);
		nav.dataset.tab = tab.key;
		nav.addEventListener("click", () => activateTab(tab.key));
		sidebar.append(nav);

		const panel = document.createElement("div");
		panel.className =
			"tab-panel" + (tab.key === state.activeTab ? " active" : "");
		panel.id = "panel-" + tab.key;

		if (tab.key === "programSettings") {
			panel.append(buildGitHubStarBlock(refresh));
		}

		renderNodes(tab.nodes, panel, 0);

		if (tab.key === "programSettings") {
			const btnRow = document.createElement("div");
			btnRow.style.cssText = "margin-top:10px;display:flex;gap:8px;";
			const btn = document.createElement("button");
			btn.className = "btn";
			btn.dataset.i18n = "settings.openAddons";
			btn.textContent = t("settings.openAddons", "Open Addons Folder");
			btn.addEventListener("click", () =>
				window.electronAPI?.openAddonsFolder(),
			);
			btnRow.append(btn);
			panel.append(btnRow);
		}

		content.append(panel);
	});

	if (hasExperiments) {
		const nav = document.createElement("div");
		nav.className =
			"nav-item" + (state.activeTab === "experiments" ? " active" : "");
		nav.textContent = tabName("experiments");
		nav.dataset.tab = "experiments";
		nav.addEventListener("click", () => activateTab("experiments"));
		sidebar.append(nav);

		const panel = document.createElement("div");
		panel.className =
			"tab-panel" + (state.activeTab === "experiments" ? " active" : "");
		panel.id = "panel-experiments";
		renderExperimentsPanel(panel);
		content.append(panel);
	}
}

export function activateTab(key) {
	state.activeTab = key;
	document
		.querySelectorAll(".nav-item")
		.forEach((n) => n.classList.toggle("active", n.dataset.tab === key));
	document
		.querySelectorAll(".tab-panel")
		.forEach((p) => p.classList.toggle("active", p.id === "panel-" + key));
}

export function refresh() {
	buildUI();
	langSelects.forEach((s) => s._repopulate?.());
	applyI18n();
}
