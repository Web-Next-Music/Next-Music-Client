import { state, STAR_GATED_PATHS } from "./state.js";
import { applyI18n, sectionName, tabName, t } from "./i18n.js";
import { mkToggle } from "./controls.js";
import { renderExperimentsPanel } from "./experiments.js";
import { buildGitHubStarBlock } from "./github.js";
import { buildDiscordSignInBlock } from "./discord.js";
import { getPath } from "./utils.js";
import "../components/config-field.js";

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text != null) node.textContent = text;
	return node;
}

const langSelects = [];

const NAV_ICONS = {
	launchSettings:
		"M14.69 2.21L4.33 11.49c-.64.58-.28 1.65.58 1.73L13 14l-4.85 6.76c-.22.31-.19.74.08 1.01.3.3.77.31 1.08.02l10.36-9.28c.64-.58.28-1.65-.58-1.73L11 10l4.85-6.76c.22-.31.19-.74-.08-1.01-.3-.3-.77-.31-1.08-.02z",
	windowSettings:
		"M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 14H5V8h14v10z",
	programSettings:
		"M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
	alpha: "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
	experiments:
		"M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z",
};

function setNavContent(nav, key) {
	const path = NAV_ICONS[key];
	if (path) {
		const svg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg",
		);
		svg.setAttribute("class", "nav-item-icon");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("width", "18");
		svg.setAttribute("height", "18");
		svg.setAttribute("fill", "currentColor");
		svg.setAttribute("aria-hidden", "true");
		const p = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path",
		);
		p.setAttribute("d", path);
		svg.append(p);
		nav.append(svg);
	}
	const label = document.createElement("span");
	label.textContent = tabName(key);
	nav.append(label);
}

export function buildSchema() {
	const tabs = [];

	for (const [tabKey, tabVal] of Object.entries(state.CONFIG)) {
		if (tabKey === "experiments") continue;
		if (tabKey === "github") continue;
		if (tabKey === "discord") continue;
		if (
			typeof tabVal !== "object" ||
			Array.isArray(tabVal) ||
			tabVal === null
		)
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

function buildPulsesyncNotice() {
	const notice = document.createElement("div");
	notice.className = "pulsesync-notice";

	const strong = document.createElement("strong");
	strong.textContent = t("settings.pulsesyncNotice.title", "Important:");
	notice.append(strong, document.createTextNode(" "));

	const links = {
		client: {
			label: "PulseSync Client",
			href: "https://github.com/PulseSync-LLC/PulseSync-client",
		},
		project: {
			label: "PulseSync",
			href: "https://pulsesync.dev/",
		},
	};

	const template = t(
		"settings.pulsesyncNotice.text",
		"Some features are adapted from {client} to provide compatibility with themes and addons originally developed for {project}.",
	);

	template.split(/(\{[a-z]+\})/g).forEach((part) => {
		const match = part.match(/^\{([a-z]+)\}$/);
		const link = match && links[match[1]];
		if (link) {
			const a = document.createElement("a");
			a.href = link.href;
			a.textContent = link.label;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			a.addEventListener("click", (e) => {
				e.preventDefault();
				window.electronAPI?.openExternal?.(link.href);
			});
			notice.append(a);
		} else if (part) {
			notice.append(document.createTextNode(part));
		}
	});

	return notice;
}

function isStarGated(path) {
	return STAR_GATED_PATHS.some(
		(gated) => path === gated || path.startsWith(gated + "."),
	);
}

function isFieldGated(path) {
	return !state.HAS_STARRED && isStarGated(path);
}

function renderGroup(node, container, depth) {
	const isCard = depth > 0;
	const enableIdx = node.children.findIndex(
		(c) => c.kind === "field" && c.path.split(".").pop() === "enable",
	);
	const title = sectionName(node.key);

	if (enableIdx === -1) {
		if (!isCard) {
			container.append(el("div", "sec-title", title));
			renderNodes(node.children, container, depth + 1);
			return;
		}
		const card = el("div", "group-card");
		const head = el("div", "group-card-head");
		head.append(el("span", "group-card-title", title));
		const body = el("div", "group-card-body");
		renderNodes(node.children, body, depth + 1);
		card.append(head, body);
		container.append(card);
		return;
	}

	const enableField = node.children[enableIdx];
	const rest = node.children.filter((_, i) => i !== enableIdx);

	const head = el("div", isCard ? "group-card-head" : "sec-title-row");
	head.append(
		el("span", isCard ? "group-card-title" : "sec-title-label", title),
	);
	const toggle = mkToggle(enableField.path);
	toggle.classList.add("group-head-toggle");
	head.append(toggle);

	const body = el("div", isCard ? "group-card-body" : "sec-body-wrap");
	if (node.key === "addons") body.append(buildPulsesyncNotice());

	const applyDisabled = () => {
		body.classList.toggle(
			"group-body--disabled",
			!getPath(state.CONFIG, enableField.path),
		);
	};
	toggle.addEventListener("change", applyDisabled);
	renderNodes(rest, body, depth + 1);
	applyDisabled();

	if (isCard) {
		const card = el("div", "group-card");
		card.append(head, body);
		container.append(card);
	} else {
		container.append(head, body);
	}
}

export function renderNodes(nodes, container, depth) {
	depth = depth || 0;
	let lastKind = null;

	let rowGroup = null;
	const rowTarget = () => {
		if (!rowGroup) {
			rowGroup = document.createElement("div");
			rowGroup.className = "row-group";
			container.append(rowGroup);
		}
		return rowGroup;
	};

	nodes.forEach((node) => {
		if (lastKind === "group" && node.kind === "field") {
			const hr = document.createElement("div");
			hr.className = "divider";
			container.append(hr);
		}
		if (node.kind !== "field") rowGroup = null;
		lastKind = node.kind;

		if (node.kind === "field") {
			const field = document.createElement("config-field");
			field.node = node;
			field.gated = isFieldGated(node.path);
			field.className = node.type === "array" ? "row col" : "row";
			rowTarget().append(field);
			if (node.type === "select" && node.path.endsWith("language")) {
				langSelects.push(field);
			}
		} else if (node.kind === "group") {
			renderGroup(node, container, depth);
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

	const saveBtn = document.createElement("mdui-button");
	saveBtn.variant = "filled";
	saveBtn.id = "save-restart-btn";
	saveBtn.className =
		"save-restart-btn" + (state.hasPendingChanges ? " visible" : "");
	saveBtn.dataset.i18n = "settings.saveRestart";
	saveBtn.textContent = t("settings.saveRestart");
	saveBtn.addEventListener("click", async () => {
		const result = await window.electronAPI?.saveConfig(state.CONFIG);
		state.ORIGINAL_CONFIG = JSON.parse(JSON.stringify(state.CONFIG));
		state.hasPendingChanges = false;
		saveBtn.classList.remove("visible");
		if (result?.needRestart) {
			window.electronAPI?.restartApp?.();
		}
	});

	if (!state.HAS_STARRED) {
		const starBtn = document.createElement("mdui-button");
		starBtn.variant = "tonal";
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
		setNavContent(nav, tab.key);
		nav.dataset.tab = tab.key;
		nav.addEventListener("click", () => activateTab(tab.key));
		sidebar.append(nav);

		const panel = document.createElement("div");
		panel.className =
			"tab-panel" + (tab.key === state.activeTab ? " active" : "");
		panel.id = "panel-" + tab.key;

		if (tab.key === "programSettings") {
			panel.append(
				buildDiscordSignInBlock(refresh),
				buildGitHubStarBlock(refresh),
			);
		}

		renderNodes(tab.nodes, panel, 0);

		if (tab.key === "programSettings") {
			const btnRow = document.createElement("div");
			btnRow.className = "addons-folder-row";
			const btn = document.createElement("mdui-button");
			btn.variant = "tonal";
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
		setNavContent(nav, "experiments");
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
	langSelects.forEach((s) => s.repopulate?.());
	applyI18n();
}
