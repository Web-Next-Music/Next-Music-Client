// Utils
function getPath(obj, path) {
    return path
        .split(".")
        .reduce((o, k) => (o != null ? o[k] : undefined), obj);
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
        STRINGS[`settings.desc.${seg}`] ||
        STRINGS[`settings.desc.${path}`] ||
        null
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

// UI builder — remembers active tab across rebuilds
const langSelects = [];
let _activeTab = null;

function renderNodes(nodes, container, depth) {
    depth = depth || 0;
    let lastKind = null;

    nodes.forEach((node) => {
        // Divider only when coming out of groups back to flat fields
        if (lastKind === "group" && node.kind === "field") {
            const hr = document.createElement("div");
            hr.className = "divider";
            container.append(hr);
        }
        lastKind = node.kind;

        if (node.kind === "field") {
            const { row, control } = mkRow(node);
            container.append(row);
            if (node.type === "select" && node.path.endsWith("language")) {
                langSelects.push(control);
            }
        } else if (node.kind === "group") {
            if (depth === 0) {
                // First level: classic section title
                const h = document.createElement("div");
                h.className = "sec-title";
                h.textContent = sectionName(node.key);
                container.append(h);
                renderNodes(node.children, container, depth + 1);
            } else {
                // Deeper levels: card with header
                const card = document.createElement("div");
                card.className = depth === 1 ? "group-card" : "group-card deep";

                const cardHead = document.createElement("div");
                cardHead.className = "group-card-head";
                const cardTitle = document.createElement("span");
                cardTitle.className = "group-card-title";
                cardTitle.textContent = sectionName(node.key);
                cardHead.append(cardTitle);
                card.append(cardHead);

                const cardBody = document.createElement("div");
                cardBody.className = "group-card-body";
                renderNodes(node.children, cardBody, depth + 1);
                card.append(cardBody);

                container.append(card);
            }
        }
    });
}

function buildUI() {
    const sidebar = document.getElementById("sidebar-nav");
    const content = document.getElementById("content");
    sidebar.innerHTML = "";
    content.innerHTML = "";
    langSelects.length = 0;

    const tabs = buildSchema();
    if (!tabs.length) return;

    if (!_activeTab || !tabs.find((t) => t.key === _activeTab)) {
        _activeTab = tabs[0].key;
    }

    // Save & Restart button — rendered into sidebar-footer, above version info
    const sidebarFooter = document.getElementById("sidebar-footer");
    const existingSaveBtn = document.getElementById("save-restart-btn");
    if (existingSaveBtn) existingSaveBtn.remove();
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
    sidebarFooter.prepend(saveBtn);

    tabs.forEach((tab) => {
        const nav = document.createElement("div");
        nav.className = "nav-item" + (tab.key === _activeTab ? " active" : "");
        nav.textContent = tabName(tab.key);
        nav.dataset.tab = tab.key;
        nav.addEventListener("click", () => activateTab(tab.key));
        sidebar.append(nav);

        const panel = document.createElement("div");
        panel.className =
            "tab-panel" + (tab.key === _activeTab ? " active" : "");
        panel.id = "panel-" + tab.key;

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
    const [cfg, strings, langList] = await Promise.all([
        window.electronAPI?.loadConfig().catch(() => ({})),
        window.electronAPI?.loadLangStrings?.().catch(() => null),
        window.electronAPI?.getLangList?.().catch(() => []),
    ]);

    CONFIG = cfg || {};
    ORIGINAL_CONFIG = JSON.parse(JSON.stringify(CONFIG));
    STRINGS = strings || {};
    LANGLIST = Array.isArray(langList) ? langList : [];

    // Populate version info in sidebar footer
    const versions = await window.electronAPI
        ?.getVersions?.()
        .catch(() => null);
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
