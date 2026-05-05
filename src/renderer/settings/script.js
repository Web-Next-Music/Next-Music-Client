import "./style.scss";

// Utils
function getPath(obj, path) {
	return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
	const keys = path.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object")
			cur[keys[i]] = {};
		cur = cur[keys[i]];
	}
	cur[keys[keys.length - 1]] = value;
}

// App state
let CONFIG = {};
let ORIGINAL_CONFIG = {};
let STRINGS = {};
let LANGLIST = [];
let ADDON_EXPERIMENTS = []; // [{ addonName, experiments: { key: value } }]
let BUILTIN_EXPERIMENTS = {}; // { key: value }

let _hasPendingChanges = false;

function checkDirty() {
	const isDirty = JSON.stringify(CONFIG) !== JSON.stringify(ORIGINAL_CONFIG);
	if (isDirty === _hasPendingChanges) return;
	_hasPendingChanges = isDirty;
	const btn = document.getElementById("save-restart-btn");
	if (btn) btn.classList.toggle("visible", isDirty);
}

function scheduleSave() {
	checkDirty();
}

let _toastTimer = null;

function showToast() {
	const el = document.getElementById("toast");
	el.classList.add("show");
	clearTimeout(_toastTimer);
	_toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

// i18n
function t(key, fallback) {
	return STRINGS[key] || fallback || key;
}

function ti(key, vars, fallback) {
	let str = STRINGS[key] || fallback || key;
	for (const [k, v] of Object.entries(vars)) {
		str = str.replace(`{${k}}`, v);
	}
	return str;
}

function applyI18n() {
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const s = STRINGS[el.dataset.i18n];
		if (s) el.textContent = s;
	});
}

// Label helpers
function fieldName(path) {
	const seg = path.split(".").pop();
	return (
		STRINGS[`settings.config.${seg}`] ||
		STRINGS[`settings.config.${path}`] ||
		seg
	);
}

function fieldDesc(path) {
	const seg = path.split(".").pop();
	return (
		STRINGS[`settings.desc.${seg}`] || STRINGS[`settings.desc.${path}`] || null
	);
}

function sectionName(key) {
	return STRINGS[`settings.config.${key}`] || key;
}

function tabName(key) {
	return STRINGS[`settings.config.${key}`] || key;
}

function buildSchema() {
	const tabs = [];

	for (const [tabKey, tabVal] of Object.entries(CONFIG)) {
		if (tabKey === "experiments") continue;
		if (tabKey === "github") continue; // managed internally, never shown in UI
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
							LANGLIST.map((l) => ({ value: l, label: l }));
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

// Control builders
function mkToggle(path) {
	const wrap = document.createElement("label");
	wrap.className = "toggle";
	const inp = document.createElement("input");
	inp.type = "checkbox";
	inp.checked = !!getPath(CONFIG, path);
	inp.addEventListener("change", () => {
		setPath(CONFIG, path, inp.checked);
		scheduleSave();
	});
	const track = document.createElement("span");
	track.className = "t-track";
	wrap.append(inp, track);
	return wrap;
}

function mkText(path) {
	const inp = document.createElement("input");
	inp.type = "text";
	inp.className = "inp";
	inp.value = getPath(CONFIG, path) ?? "";
	inp.addEventListener("input", () => {
		setPath(CONFIG, path, inp.value);
		scheduleSave();
	});
	return inp;
}

function mkNumber(path) {
	const inp = document.createElement("input");
	inp.type = "number";
	inp.className = "inp num";
	inp.value = getPath(CONFIG, path) ?? 0;
	inp.addEventListener("input", () => {
		const v = parseInt(inp.value, 10);
		setPath(CONFIG, path, isNaN(v) ? 0 : v);
		scheduleSave();
	});
	return inp;
}

function mkSelect(path, optionsFn) {
	const sel = document.createElement("select");
	sel.className = "sel";
	function populate() {
		const current = getPath(CONFIG, path) ?? "";
		sel.innerHTML = "";
		const opts = optionsFn();
		const list = opts.length ? opts : [{ value: current, label: current }];
		list.forEach(({ value, label }) => {
			const o = document.createElement("option");
			o.value = value;
			o.textContent = label;
			if (value === current) o.selected = true;
			sel.append(o);
		});
	}
	populate();
	sel._repopulate = populate;
	sel.addEventListener("change", () => {
		setPath(CONFIG, path, sel.value);
		if (!path.endsWith("language")) scheduleSave();
		window.electronAPI?.setLanguage?.(sel.value);
	});
	return sel;
}

function mkArray(path) {
	const ta = document.createElement("textarea");
	ta.className = "ta";
	ta.placeholder = "https://example.com/script.js";
	const arr = getPath(CONFIG, path);
	ta.value = Array.isArray(arr) ? arr.join("\n") : "";
	ta.addEventListener("input", () => {
		const lines = ta.value
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
		setPath(CONFIG, path, lines);
		scheduleSave();
	});
	return ta;
}

// Row
function mkRow(field) {
	const row = document.createElement("div");
	row.className = field.type === "array" ? "row col" : "row";

	const lbl = document.createElement("div");
	lbl.className = "lbl";

	const name = document.createElement("div");
	name.className = "lbl-name";
	name.textContent = fieldName(field.path);
	lbl.append(name);

	const desc = fieldDesc(field.path);
	if (desc) {
		const d = document.createElement("div");
		d.className = "lbl-desc";
		d.textContent = desc;
		lbl.append(d);
	}

	row.append(lbl);

	let control;
	switch (field.type) {
		case "bool":
			control = mkToggle(field.path);
			break;
		case "number":
			control = mkNumber(field.path);
			break;
		case "select":
			control = mkSelect(field.path, field.optionsFn);
			break;
		case "array":
			control = mkArray(field.path);
			break;
		default:
			control = mkText(field.path);
			break;
	}
	row.append(control);
	return { row, control };
}

// ── experiments tab ───────────────────────────────────────────────────────────────

function rebuildexperimentsConfig(container) {
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
	CONFIG.experiments = experiments;
	scheduleSave();
}

function getBuiltinExperimentDefault(name) {
	return Object.prototype.hasOwnProperty.call(BUILTIN_EXPERIMENTS, name)
		? BUILTIN_EXPERIMENTS[name]
		: null;
}

function syncExperimentRowMeta(row, addonLock, name) {
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
function mkexperimentsRow(name, value, container, meta = {}) {
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
	} else {
		const delBtn = document.createElement("button");
		delBtn.className = "btn experiments-del";
		delBtn.textContent = "×";

		const onChange = () => {
			syncExperimentRowMeta(row, addonLock, nameInp.value.trim());
			rebuildexperimentsConfig(container);
		};
		nameInp.addEventListener("input", onChange);
		sel.addEventListener("change", onChange);
		delBtn.addEventListener("click", () => {
			row.remove();
			rebuildexperimentsConfig(container);
		});

		mainLine.append(nameInp, sel, delBtn);
	}

	if (addonLock) {
		mainLine.append(nameInp, sel);
	}

	const metaWrap = document.createElement("div");
	metaWrap.className = "experiments-meta";

	row.append(mainLine, metaWrap);
	syncExperimentRowMeta(row, addonLock, name);

	return row;
}

function renderexperimentsPanel(panel) {
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
	for (const { addonName, experiments } of ADDON_EXPERIMENTS) {
		for (const [name, value] of Object.entries(experiments)) {
			if (!addonOverrideMap.has(name)) {
				addonOverrideMap.set(name, { addonName, value });
			}
		}
	}

	const userOverrides = CONFIG.experiments || {};
	const builtinEntries = Object.entries(BUILTIN_EXPERIMENTS || {});

	// User experiments — locked if addon overrides them
	for (const [name, val] of Object.entries(userOverrides)) {
		const addonLock = addonOverrideMap.get(name);
		if (addonLock) {
			rowsWrap.append(
				mkexperimentsRow(name, addonLock.value, rowsWrap, {
					addonLock: {
						addonName: addonLock.addonName,
						isConflict: true,
					},
				}),
			);
		} else {
			rowsWrap.append(mkexperimentsRow(name, val, rowsWrap));
		}
	}

	// Built-in experiments (not set by user)
	for (const [name, builtinValue] of builtinEntries) {
		if (name in userOverrides) continue;
		const addonLock = addonOverrideMap.get(name);
		if (addonLock) {
			rowsWrap.append(
				mkexperimentsRow(name, addonLock.value, rowsWrap, {
					addonLock: {
						addonName: addonLock.addonName,
						isConflict: false,
					},
				}),
			);
		} else {
			rowsWrap.append(mkexperimentsRow(name, builtinValue, rowsWrap));
		}
	}

	// Addon-only experiments (not set by user)
	for (const [name, { addonName, value }] of addonOverrideMap) {
		if (!(name in userOverrides) && !getBuiltinExperimentDefault(name)) {
			rowsWrap.append(
				mkexperimentsRow(name, value, rowsWrap, {
					addonLock: {
						addonName,
						isConflict: false,
					},
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
		const row = mkexperimentsRow("", "unset", rowsWrap);
		rowsWrap.append(row);
		row.querySelector(".experiments-name").focus();
	});
}

// UI builder
const langSelects = [];
let _activeTab = null;

// GitHub star — live-checked via IPC
let HAS_STARRED = false;

// Paths that require a GitHub star to edit
const STAR_GATED_PATHS = [
	"programSettings.richPresence.rpcTitle",
	"programSettings.richPresence.buttons.githubButton",
];

function isStarGated(path) {
	return STAR_GATED_PATHS.some(
		(gated) => path === gated || path.startsWith(gated + "."),
	);
}

function maybeGate(element, path) {
	if (HAS_STARRED || !isStarGated(path)) return element;

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

function renderNodes(nodes, container, depth) {
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
						const enabled = !!getPath(CONFIG, enableField.path);
						bodyWrap.classList.toggle("group-body--disabled", !enabled);
					};
					toggle
						.querySelector("input")
						.addEventListener("change", applyDisabled);
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
						const enabled = !!getPath(CONFIG, enableField.path);
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

// GitHub Star block

function buildGitHubStarBlock() {
	const hasStarred = HAS_STARRED;
	const hasToken = !!CONFIG?.github?.accessToken;

	const wrap = document.createElement("div");
	wrap.className = "gh-star-block";

	const header = document.createElement("div");
	header.className = "gh-star-header";

	const icon = document.createElement("span");
	icon.className = "gh-star-icon";
	icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

	const title = document.createElement("span");
	title.className = "gh-star-title";
	title.textContent = t("settings.github.title");

	const badge = document.createElement("span");
	badge.className = "gh-star-badge" + (hasStarred ? " gh-star-badge--ok" : "");
	badge.textContent = hasStarred
		? t("settings.github.starred")
		: t("settings.github.notStarred");

	header.append(icon, title, badge);
	wrap.append(header);

	const desc = document.createElement("div");
	desc.className = "gh-star-desc";
	desc.textContent = t("settings.github.desc");
	wrap.append(desc);

	const deviceArea = document.createElement("div");
	deviceArea.className = "gh-device-area";
	deviceArea.hidden = true;

	const deviceInstr = document.createElement("div");
	deviceInstr.className = "gh-device-instr";
	deviceInstr.textContent = t("settings.github.deviceInstr");
	const deviceCode = document.createElement("div");
	deviceCode.className = "gh-device-code";
	const deviceTimer = document.createElement("div");
	deviceTimer.className = "gh-device-timer";

	deviceArea.append(deviceInstr, deviceCode, deviceTimer);
	wrap.append(deviceArea);

	const errLine = document.createElement("div");
	errLine.className = "gh-star-error";
	errLine.hidden = true;
	wrap.append(errLine);

	const actRow = document.createElement("div");
	actRow.className = "gh-star-actions";

	async function doConnect() {
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
		deviceArea.hidden = true;
		errLine.hidden = true;
		deviceCode.textContent = "…";
		deviceTimer.textContent = "";

		const unsubCode = window.electronAPI?.onGitHubDeviceCode?.((info) => {
			deviceArea.hidden = false;
			deviceCode.textContent = info.userCode;
			deviceTimer.textContent = `${info.expiresIn}s`;
		});
		const unsubProgress = window.electronAPI?.onGitHubDeviceProgress?.(
			(secondsLeft) => {
				deviceTimer.textContent = `${secondsLeft}s`;
			},
		);

		const result = await window.electronAPI?.connectGitHub?.();

		unsubCode?.();
		unsubProgress?.();
		deviceArea.hidden = true;
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = false));

		if (result?.error) {
			errLine.textContent = result.error;
			errLine.hidden = false;
			return;
		}

		if (!CONFIG.github) CONFIG.github = {};
		HAS_STARRED = result?.hasStarred ?? false;
		CONFIG.github.accessToken = "__has_token__";
		refresh();
	}

	async function doDisconnect() {
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
		await window.electronAPI?.disconnectGitHub?.();

		if (!CONFIG.github) CONFIG.github = {};
		HAS_STARRED = false;
		CONFIG.github.accessToken = null;

		// Full refresh so gate overlays on rpcTitle/githubButton apply immediately
		refresh();
	}

	if (!hasToken) {
		const connectBtn = document.createElement("button");
		connectBtn.className = "btn gh-star-connect-btn";
		connectBtn.textContent = t("settings.github.connect");
		connectBtn.addEventListener("click", doConnect);
		actRow.append(connectBtn);
	} else {
		const recheckBtn = document.createElement("button");
		recheckBtn.className = "btn";
		recheckBtn.textContent = t("settings.github.recheck");
		recheckBtn.addEventListener("click", doConnect);

		const disconnectBtn = document.createElement("button");
		disconnectBtn.className = "btn gh-star-disconnect-btn";
		disconnectBtn.textContent = t("settings.github.disconnect");
		disconnectBtn.addEventListener("click", doDisconnect);

		actRow.append(recheckBtn, disconnectBtn);
	}

	wrap.append(actRow);
	return wrap;
}

function buildUI() {
	const sidebar = document.getElementById("sidebar-nav");
	const content = document.getElementById("content");
	sidebar.innerHTML = "";
	content.innerHTML = "";
	langSelects.length = 0;

	const tabs = buildSchema();
	const hasexperiments = CONFIG.experiments !== undefined;

	if (!tabs.length && !hasexperiments) return;

	if (
		!_activeTab ||
		(!tabs.find((t) => t.key === _activeTab) && _activeTab !== "experiments")
	) {
		_activeTab = tabs.length ? tabs[0].key : "experiments";
	}

	// Save & Restart
	const sidebarFooter = document.getElementById("sidebar-footer");
	const existingSaveBtn = document.getElementById("save-restart-btn");
	if (existingSaveBtn) existingSaveBtn.remove();
	const existingStarBtn = document.getElementById("star-project-btn");
	if (existingStarBtn) existingStarBtn.remove();

	const saveBtn = document.createElement("button");
	saveBtn.id = "save-restart-btn";
	saveBtn.className =
		"save-restart-btn" + (_hasPendingChanges ? " visible" : "");
	saveBtn.dataset.i18n = "settings.saveRestart";
	saveBtn.textContent = t("settings.saveRestart");
	saveBtn.addEventListener("click", async () => {
		await window.electronAPI?.saveConfig(CONFIG);
		ORIGINAL_CONFIG = JSON.parse(JSON.stringify(CONFIG));
		_hasPendingChanges = false;
		window.electronAPI?.restartApp?.();
	});

	// Star Project
	if (!HAS_STARRED) {
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
		nav.className = "nav-item" + (tab.key === _activeTab ? " active" : "");
		nav.textContent = tabName(tab.key);
		nav.dataset.tab = tab.key;
		nav.addEventListener("click", () => activateTab(tab.key));
		sidebar.append(nav);

		const panel = document.createElement("div");
		panel.className = "tab-panel" + (tab.key === _activeTab ? " active" : "");
		panel.id = "panel-" + tab.key;

		// GitHub star block
		if (tab.key === "programSettings") {
			panel.append(buildGitHubStarBlock());
		}

		renderNodes(tab.nodes, panel, 0);

		// Addons folder button
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

	// experiments tab — special dynamic UI
	if (hasexperiments) {
		const nav = document.createElement("div");
		nav.className =
			"nav-item" + (_activeTab === "experiments" ? " active" : "");
		nav.textContent = tabName("experiments");
		nav.dataset.tab = "experiments";
		nav.addEventListener("click", () => activateTab("experiments"));
		sidebar.append(nav);

		const panel = document.createElement("div");
		panel.className =
			"tab-panel" + (_activeTab === "experiments" ? " active" : "");
		panel.id = "panel-experiments";
		renderexperimentsPanel(panel);
		content.append(panel);
	}
}

function activateTab(key) {
	_activeTab = key;
	document
		.querySelectorAll(".nav-item")
		.forEach((n) => n.classList.toggle("active", n.dataset.tab === key));
	document
		.querySelectorAll(".tab-panel")
		.forEach((p) => p.classList.toggle("active", p.id === "panel-" + key));
}

// Full refresh
function refresh() {
	buildUI();
	langSelects.forEach((s) => s._repopulate?.());
	applyI18n();
}

// Titlebar — maximize / restore
const ICON_EXPAND = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
</svg>`;

const ICON_RESTORE = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
</svg>`;

let _isMaximized = false;

function toggleMaximize() {
	window.electronAPI?.toggleMaximize?.();
}

window.electronAPI?.onMaximizeChange?.((maximized) => {
	_isMaximized = maximized;
	const btn = document.getElementById("tb-maximize");
	if (btn) btn.innerHTML = _isMaximized ? ICON_RESTORE : ICON_EXPAND;
});

// Init
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

	CONFIG = cfg || {};
	ORIGINAL_CONFIG = JSON.parse(JSON.stringify(CONFIG));
	STRINGS = strings || {};
	LANGLIST = Array.isArray(langList) ? langList : [];
	ADDON_EXPERIMENTS = Array.isArray(addonExps) ? addonExps : [];
	BUILTIN_EXPERIMENTS =
		builtinExps && typeof builtinExps === "object" ? builtinExps : {};
	HAS_STARRED = starResult?.hasStarred ?? false;

	// Read real token presence from main process
	if (!CONFIG.github) CONFIG.github = {};
	CONFIG.github.accessToken = tokenResult?.hasToken ? "__has_token__" : null;

	// Populate version info in sidebar footer
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

	// Live language change from main process (tray menu or settings dropdown)
	window.electronAPI?.onLanguageChange?.((newStrings) => {
		STRINGS = newStrings || {};
		refresh();
	});
}

init();
