// ── Button order configuration ────────────────────────────────────────────────

//   "toggle"   — кнопка Enable / Disable
//   "delete"   — кнопка удаления (иконка корзины)
//   "settings" — кнопка открытия handleEvents.json (показывается только если файл есть)
//   "download" — кнопка Download (только для не-установленных элементов)
//   "update" — кнопка Update; при её наличии "toggle" автоматически сворачивается в иконку
//   "readme"   — иконка README в заголовке карточки (не в .card-actions, а в .card-name)

// Карточки из магазина (вкладки Addons / Themes) — когда элемент УЖЕ установлен
const CARD_BUTTONS_INSTALLED = ["toggle", "settings", "delete"];

// Карточки из магазина — когда элемент ЕЩЁ НЕ установлен
const CARD_BUTTONS_NOT_INSTALLED = ["download", "settings"];

// Карточки на вкладке Custom / Installed (локальные файлы и папки)
const CARD_BUTTONS_CUSTOM = ["toggle", "settings", "delete"];

// Кнопки, которые появляются после успешного скачивания (inline-обновление)
const CARD_BUTTONS_AFTER_DOWNLOAD = ["toggle", "settings", "delete"];

// Кнопки установленной карточки, когда доступно обновление
const CARD_BUTTONS_WITH_UPDATE = ["update", "toggle", "settings", "delete"];

// ── Локализация (langManager на клиенте) ─────────────────────────────────────

let _lang = {};

async function loadLang() {
    try {
        const res = await fetch("/api/lang");

        const text = await res.text(); // 👈 ВАЖНО

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error("[lang] NOT JSON RESPONSE:\n", text);
            throw new Error("Lang endpoint returned HTML instead of JSON");
        }

        if (data && typeof data === "object" && !data.error && data.store) {
            _lang = data;
            console.log("[lang] loaded:", data.store.btnDownload);
        } else {
            console.warn("[lang] unexpected response:", data);
        }
    } catch (e) {
        console.warn("[lang] failed:", e.message);
    }
}

function t(key, vars = {}) {
    const parts = key.split(".");
    let value = _lang;
    for (const part of parts) {
        if (value && typeof value === "object" && part in value) {
            value = value[part];
        } else {
            return key;
        }
    }
    if (typeof value !== "string") return key;
    return value.replace(/\{(\w+)\}/g, (_, k) =>
        k in vars ? vars[k] : `{${k}}`,
    );
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    await loadLang();
    applyStaticI18n();
})();

function applyStaticI18n() {
    // Close button tooltip
    const closeBtn = document.querySelector(".store-close-btn");
    if (closeBtn) closeBtn.title = t("store.tooltipClose");

    // Tab labels
    const tabAddons = document.querySelector(
        "[onclick*=\"switchTab('addons'\"]",
    );
    const tabThemes = document.querySelector(
        "[onclick*=\"switchTab('themes'\"]",
    );
    const tabInstalled = document.querySelector(
        "[onclick*=\"switchTab('installed'\"]",
    );
    if (tabAddons) {
        const txt = tabAddons.querySelector(".tab-label");
        if (txt) txt.textContent = t("store.tabAddons");
    }
    if (tabThemes) {
        const txt = tabThemes.querySelector(".tab-label");
        if (txt) txt.textContent = t("store.tabThemes");
    }
    if (tabInstalled) {
        const txt = tabInstalled.querySelector(".tab-label");
        if (txt) txt.textContent = t("store.tabInstalled");
    }

    // Search placeholder
    const searchBox = document.getElementById("search-box");
    if (searchBox) searchBox.placeholder = t("store.searchPlaceholder");

    // Section labels
    const secAddons = document.querySelector("#panel-addons .sec-label");
    if (secAddons) secAddons.textContent = t("store.sectionAddons");
    const secThemes = document.querySelector("#panel-themes .sec-label");
    if (secThemes) secThemes.textContent = t("store.sectionThemes");
    const secInstalled = document.querySelector("#panel-installed .sec-label");
    if (secInstalled) secInstalled.textContent = t("store.sectionInstalled");

    // Editor modal static buttons / badge
    const editorBadge = document.querySelector(".editor-modal-badge");
    if (editorBadge) editorBadge.textContent = t("store.modalEditorBadge");
    const cancelBtn = document.querySelector(".btn-editor-cancel");
    if (cancelBtn) cancelBtn.textContent = t("store.btnCancel");
    const saveBtn = document.querySelector(".btn-editor-save");
    if (saveBtn) saveBtn.textContent = t("store.btnSave");
}

// ── Apply CSS vars from parent window ────────────────────────────────────────
(async () => {
    const vars = await fetch("/api/theme-vars").then((r) => r.json());
    if (!vars) return;

    const root = document.documentElement; // <html> внутри iframe
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
})();

// ── Open URL in system browser ────────────────────────────────────────────────
function openInBrowser(url, event) {
    event && event.preventDefault();
    event && event.stopPropagation();
    fetch("/api/open-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    }).catch(() => {});
}

// ── Cross-tab sync via BroadcastChannel ───────────────────────────────────────
const storeChannel = new BroadcastChannel("store-sync");

function broadcastChange(type, payload) {
    storeChannel.postMessage({ type, payload });
}

storeChannel.onmessage = ({ data }) => {
    const { type, payload } = data;
    if (type === "installed") {
        loadInstalled();
    } else if (type === "toggled") {
        // Update card state in addons/themes grids
        const { name, enabled } = payload;
        document.querySelectorAll(".card").forEach((card) => {
            if ((card.dataset.name || "").toLowerCase() !== name.toLowerCase())
                return;
            const btn = card.querySelector(".btn-on, .btn-off");
            if (!btn) return;
            if (enabled) {
                btn.className = "btn btn-on";
                btn.innerHTML = "Disable";
                card.classList.remove("item-disabled");
            } else {
                btn.className = "btn btn-off";
                btn.innerHTML = "Enable";
                card.classList.add("item-disabled");
            }
        });
        loadInstalled();
    } else if (type === "deleted") {
        const { name, section } = payload;
        // Remove from installed/custom grids
        ["grid-installed", "grid-custom"].forEach((gridId) => {
            const card = document.querySelector(
                `#${gridId} [data-name="${name}"]`,
            );
            if (card) card.remove();
        });
        // Reset card in addons/themes grid back to Download state
        if (section) {
            const allSectionItems = allItems[section] || [];
            const f = allSectionItems.find((x) => x.name === name);
            const cid = section + "-" + name;
            const card = document.getElementById("card-" + cid);
            if (card && f) {
                card.classList.remove("installed", "item-disabled");
                const dlArg = encodeURIComponent(
                    JSON.stringify({
                        name: f.name,
                        folderPath: f.path,
                        section,
                        submodule: !!f.submodule,
                        subUrl: f.subUrl || "",
                    }),
                );
                card.querySelector(".card-actions").innerHTML =
                    `<button class="btn btn-primary" onclick="doDownload(decodeURIComponent('${dlArg}'),this,event)">Download</button>`;
            }
        }
        loadInstalled();
    } else if (type === "downloaded") {
        loadInstalled();
    }
};

// ── SVG icons ─────────────────────────────────────────────────────────────────
const ICONS = {
    download: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 12h10"/></svg>`,
    enable: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap-off-icon lucide-zap-off"><path d="M10.513 4.856 13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317"/><path d="M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773"/><path d="M16.273 16.273 10.88 21.83a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14H4a1 1 0 0 1-.78-1.63l4.507-4.643"/><path d="m2 2 20 20"/></svg>`,
    disable: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap-icon lucide-zap"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
    trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    readme: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h6l3 3v9H4V2z"/><path d="M10 2v3h3"/><path d="M6 8h4M6 11h3"/></svg>`,
    addon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks-icon lucide-blocks"><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"/><rect x="14" y="2" width="8" height="8" rx="1"/></svg>`,
    theme: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-palette-icon lucide-palette"><path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-code-icon lucide-folder-code"><path d="M10 10.5 8 13l2 2.5"/><path d="m14 10.5 2 2.5-2 2.5"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-code-corner-icon lucide-file-code-corner"><path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m5 16-3 3 3 3"/><path d="m9 22 3-3-3-3"/></svg>`,
    warning: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v3"/><circle cx="8" cy="11.5" r=".7" fill="currentColor"/></svg>`,
    custom: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bolt-icon lucide-bolt"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><circle cx="12" cy="12" r="4"/></svg>`,
};

// ── State ─────────────────────────────────────────────────────────────────────
let currentTab = "addons";
const allItems = { addons: [], themes: [], custom: [], installed: [] };
let restartNeeded = false;

// ── Restart banner ────────────────────────────────────────────────────────────
function showRestartBanner() {
    if (restartNeeded) return;
    restartNeeded = true;
    const banner = document.createElement("div");
    banner.id = "restart-banner";
    banner.innerHTML = `
        <span class="restart-icon">${ICONS.warning}</span>
        <span class="restart-text">${t("store.statusRestartRequired")}</span>
        <button class="btn-restart" onclick="doReload()">${t("store.btnRestart")}</button>`;
    document.body.appendChild(banner);
    // animate in
    requestAnimationFrame(() => banner.classList.add("visible"));
}

async function doReload() {
    try {
        await fetch("/api/reload", { method: "POST" });
    } catch {
        // If fetch fails (e.g. page already reloading), fallback
    }
    // Reload the store iframe itself as fallback
    location.reload(true);
}

function checkNeedsRestart(data) {
    // If the server tells us JS was touched, or we assume any toggle/delete/download
    // of an installed item that might contain .js needs a restart
    if (data && data.hasJs !== undefined) return data.hasJs;
    // Fallback: always suggest restart for installs/deletes/toggles
    return true;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(n, el) {
    currentTab = n;
    document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
    document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.remove("active"));
    el.classList.add("active");
    document.getElementById("panel-" + n).classList.add("active");
    onSearch(document.getElementById("search-box").value);
}

// ── Search ────────────────────────────────────────────────────────────────────
function onSearch(q) {
    const needle = q.trim().toLowerCase();
    const grid = document.getElementById("grid-" + currentTab);
    if (!grid) return;
    if (!needle) {
        grid.querySelectorAll(".card").forEach((c) => (c.style.display = ""));
        const noR = grid.querySelector(".no-results");
        if (noR) noR.remove();
        return;
    }
    let visible = 0;
    grid.querySelectorAll(".card").forEach((c) => {
        const show = (c.dataset.name || "").toLowerCase().includes(needle);
        c.style.display = show ? "" : "none";
        if (show) visible++;
    });
    let noR = grid.querySelector(".no-results");
    if (visible === 0) {
        if (!noR) {
            noR = document.createElement("div");
            noR.className = "no-results";
            grid.appendChild(noR);
        }
        noR.textContent = t("store.searchNoResults", { query: q });
    } else if (noR) {
        noR.remove();
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const SP = () => '<span class="spin"></span>';
function setBtn(b, h, d) {
    b.innerHTML = h;
    b.disabled = !!d;
}
async function api(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
}
function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function md2html(t) {
    const e = (s) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    t = t.replace(
        /```[\w]*\n?([\s\S]*?)```/g,
        (_, c) => "<pre><code>" + e(c.trim()) + "</code></pre>",
    );
    t = t.replace(/`([^`\n]+)`/g, (_, c) => "<code>" + e(c) + "</code>");
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    t = t.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>',
    );
    t = t.replace(/^#{3} (.+)$/gm, "<h3>$1</h3>");
    t = t.replace(/^#{2} (.+)$/gm, "<h2>$1</h2>");
    t = t.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
    t = t.replace(/^---+$/gm, "<hr>");
    t = t.replace(/^[\*\-] (.+)$/gm, "<li>$1</li>");
    t = t.replace(/(<li>[\s\S]*?<\/li>)/g, (s) => "<ul>" + s + "</ul>");
    t = t
        .split(/\n\n+/)
        .map((b) =>
            b.trim().startsWith("<")
                ? b
                : "<p>" + b.replace(/\n/g, " ") + "</p>",
        )
        .join("\n");
    return t;
}

// ── README modal ──────────────────────────────────────────────────────────────
async function openReadme(name, readmeUrl, event) {
    event && event.stopPropagation();
    document.getElementById("modal-title").textContent = t(
        "store.modalReadmeTitle",
        { name },
    );
    document.getElementById("modal-body").innerHTML =
        `<div class="modal-loading">${SP()} ${t("store.statusLoading")}</div>`;
    document.getElementById("modal-bg").classList.remove("hidden");
    try {
        const isLocal =
            readmeUrl.startsWith("/api/local-readme") ||
            readmeUrl.includes("/api/local-readme");
        let fetchUrl;
        if (isLocal) {
            // Normalize nextstore://app/api/... → /api/...
            fetchUrl = readmeUrl.replace(/^nextstore:\/\/[^/]+/, "");
        } else {
            fetchUrl = "/api/readme?url=" + encodeURIComponent(readmeUrl);
        }
        const r = await fetch(fetchUrl);
        document.getElementById("modal-body").innerHTML = md2html(
            await r.text(),
        );
    } catch {
        document.getElementById("modal-body").innerHTML =
            `<div class="modal-loading">${t("store.statusFailedReadme")}</div>`;
    }
}
function closeModal() {
    document.getElementById("modal-bg").classList.add("hidden");
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (
            !document
                .getElementById("editor-modal-bg")
                .classList.contains("hidden")
        )
            return; // handled by textarea
        closeModal();
    }
});

// ── handleEvents.json in-store editor (CodeMirror 5) ─────────────────────────
let _editorAddonName = null;
let _editorOriginal = "";
let _cmEditor = null;

function _initCM() {
    if (_cmEditor) return;
    const host = document.getElementById("editor-cm-host");
    _cmEditor = CodeMirror(host, {
        mode: { name: "javascript", json: true },
        theme: "nm-dark",
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: {
            "Ctrl-S": () => saveHandleEvents(),
            "Cmd-S": () => saveHandleEvents(),
            Escape: () => closeEditorModal(),
            Tab: (cm) => cm.execCommand("indentMore"),
            "Shift-Tab": (cm) => cm.execCommand("indentLess"),
        },
    });
    _cmEditor.on("change", () => {
        try {
            JSON.parse(_cmEditor.getValue());
            setEditorStatus("", false);
            document.getElementById("editor-save-btn").disabled = false;
        } catch (e) {
            setEditorStatus(
                t("store.statusInvalidJson", { message: e.message }),
                true,
            );
            document.getElementById("editor-save-btn").disabled = true;
        }
    });
}

async function openHandleEvents(name, btn, event) {
    event && event.stopPropagation();
    if (!btn || btn.disabled) return;

    const prev = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>';
    btn.disabled = true;

    try {
        const r = await fetch(
            "/api/read-handle-events?name=" + encodeURIComponent(name),
        );
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "Failed to read file");

        _editorAddonName = name;
        _editorOriginal = formatJson(data.content);

        document.getElementById("editor-modal-title").textContent = t(
            "store.modalEditorTitle",
            { name },
        );
        setEditorStatus("", false);
        document.getElementById("editor-save-btn").disabled = false;
        document.getElementById("editor-modal-bg").classList.remove("hidden");

        // Init CM lazily on first open, then reuse
        _initCM();
        _cmEditor.setValue(_editorOriginal);
        _cmEditor.clearHistory();
        // Refresh after modal becomes visible
        requestAnimationFrame(() => {
            _cmEditor.refresh();
            _cmEditor.focus();
        });
    } catch (e) {
        // fallback: open in system editor
        await api("/api/open-handle-events", { name }).catch(() => {});
    } finally {
        btn.innerHTML = prev;
        btn.disabled = false;
    }
}

function formatJson(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

function closeEditorModal() {
    document.getElementById("editor-modal-bg").classList.add("hidden");
    _editorAddonName = null;
    _editorOriginal = "";
    setEditorStatus("", false);
}

function setEditorStatus(msg, isError) {
    const el = document.getElementById("editor-status-msg");
    el.textContent = msg;
    el.className =
        "editor-status-msg" +
        (isError ? " editor-status-err" : msg ? " editor-status-ok" : "");
}

async function saveHandleEvents() {
    if (!_cmEditor) return;
    const content = _cmEditor.getValue();
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        setEditorStatus(
            t("store.statusInvalidJson", { message: e.message }),
            true,
        );
        return;
    }
    const saveBtn = document.getElementById("editor-save-btn");
    const prevHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spin"></span>';

    try {
        const pretty = JSON.stringify(parsed, null, 2);
        const data = await api("/api/save-handle-events", {
            name: _editorAddonName,
            content: pretty,
        });
        if (!data.ok) throw new Error(data.error || "Save failed");
        _editorOriginal = pretty;
        _cmEditor.setValue(pretty);
        _cmEditor.clearHistory();
        setEditorStatus(t("store.statusSaved"), false);
        setTimeout(() => setEditorStatus("", false), 2500);
    } catch (e) {
        setEditorStatus(
            t("store.statusInvalidJson", {
                message: e.message || t("store.statusSaveFailed"),
            }),
            true,
        );
    } finally {
        saveBtn.innerHTML = prevHtml;
        saveBtn.disabled = false;
    }
}

// ── Check handleEvents.json and show/hide settings button ────────────────────
async function checkAndShowSettingsBtn(name, btnId, isInstalled) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    try {
        const r = await fetch(
            "/api/check-handle-events?name=" + encodeURIComponent(name),
        );
        const data = await r.json();
        if (data.exists) {
            btn.style.display = "";
            btn.disabled = !isInstalled;
        }
    } catch {
        // silently ignore
    }
}

// ── Button renderer (использует массивы порядка из начала файла) ──────────────
function renderButtons(order, ctx) {
    // ctx = { name, enabled, inst, cid, settingsBtnId, dlArg, isIconMode }
    return order
        .map((key) => {
            switch (key) {
                case "toggle": {
                    const tc = ctx.enabled ? "btn-on" : "btn-off";
                    const tl = ctx.enabled
                        ? ctx.isIconMode
                            ? ICONS.disable
                            : t("store.btnDisable")
                        : ctx.isIconMode
                          ? ICONS.enable
                          : t("store.btnEnable");
                    const title = ctx.isIconMode
                        ? ctx.enabled
                            ? t("store.tooltipDisable")
                            : t("store.tooltipEnable")
                        : "";
                    const iconCls = ctx.isIconMode ? " btn-toggle-icon" : "";
                    return `<button class="btn ${tc}${iconCls}" onclick="doToggle('${esc(ctx.name)}',this,event)" title="${title}">${tl}</button>`;
                }
                case "delete":
                    return `<button class="btn btn-danger" onclick="doDelete('${esc(ctx.name)}',this,event)" title="${t("store.tooltipDelete")}">${ICONS.trash}</button>`;
                case "settings":
                    return `<button class="btn btn-settings" id="${ctx.settingsBtnId}" title="${t("store.tooltipSettings")}" onclick="openHandleEvents('${esc(ctx.name)}',this,event)" style="display:none" ${ctx.inst !== undefined && !ctx.inst ? "disabled" : ""}>${ICONS.settings}</button>`;
                case "download":
                    return ctx.dlArg
                        ? `<button class="btn btn-primary" onclick="doDownload(decodeURIComponent('${ctx.dlArg}'),this,event)">${t("store.btnDownload")}</button>`
                        : "";
                case "update":
                    return ctx.updateDlArg
                        ? `<button class="btn btn-primary btn-update" title="${t("store.btnUpdate")}" onclick="doUpdate(decodeURIComponent('${ctx.updateDlArg}'),this,event)">${t("store.btnUpdate")}</button>`
                        : "";
                default:
                    return "";
            }
        })
        .join("");
}

// ── Card builder (store items) ────────────────────────────────────────────────
function buildCard(f, i, section, inst) {
    const cid = section + "-" + f.name;
    const enabled = inst ? inst.enabled : true;
    const iconSvg = section === "themes" ? ICONS.theme : ICONS.addon;
    const phId = "ph-" + cid.replace(/[^a-zA-Z0-9]/g, "_");

    const logoTag = f.logo
        ? `<img class="card-logo" id="${phId}" src="/api/logo?url=${encodeURIComponent(f.logo)}" loading="lazy" onerror="var p=document.createElement('div');p.className='card-logo-ph';p.innerHTML=window.ICONS['${section === "themes" ? "theme" : "addon"}'];this.parentNode.replaceChild(p,this);">`
        : `<div class="card-logo-ph">${iconSvg}</div>`;

    const rmIcon = f.readme
        ? `<span class="readme-icon" title="${t("store.tooltipReadme")}" onclick="openReadme('${esc(f.name)}','${esc(f.readme)}',event)">${ICONS.readme}</span>`
        : "";

    let actions;
    if (inst) {
        actions = renderButtons(CARD_BUTTONS_INSTALLED, {
            name: f.name,
            enabled,
            inst: true,
            settingsBtnId: "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_"),
        });
    } else {
        const dlArg = encodeURIComponent(
            JSON.stringify({
                name: f.name,
                folderPath: f.path,
                section,
                submodule: !!f.submodule,
                subUrl: f.subUrl || "",
            }),
        );
        actions = renderButtons(CARD_BUTTONS_NOT_INSTALLED, {
            name: f.name,
            enabled: true,
            inst: false,
            settingsBtnId: "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_"),
            dlArg,
        });
    }

    const cls = [
        "card",
        inst ? "installed" : "",
        inst && !enabled ? "item-disabled" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const rmAttr = f.readme
        ? `onclick="openReadme('${esc(f.name)}','${esc(f.readme)}',event)"`
        : "";

    let cardSub;
    if (f.submodule && f.subUrl) {
        const m = f.subUrl.match(
            /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
        );
        if (m) {
            const repoUrl = esc(`https://github.com/${m[1]}/${m[2]}`);
            cardSub = `<a class="card-sub-link" href="#" onclick="openInBrowser('${repoUrl}',event)">${m[1]} / ${m[2]}</a>`;
        } else {
            cardSub = `${section === "themes" ? t("store.sectionThemes") : t("store.sectionAddons")} / ${f.name}`;
        }
    } else {
        cardSub = `${section === "themes" ? "Themes" : "Addons"} / ${f.name}`;
    }

    // Schedule async check for handleEvents.json (only if installed)
    if (inst) {
        const btnId = "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_");
        setTimeout(() => checkAndShowSettingsBtn(f.name, btnId, true), 0);
    }

    return `<div class="${cls}" style="animation-delay:${i * 0.048}s" id="card-${cid}" data-name="${f.name}" ${rmAttr}>
  <div class="card-top">
    ${logoTag}
    <div class="card-meta">
      <div class="card-name"><span class="card-name-text">${f.name}</span>${rmIcon}</div>
      <div class="card-sub">${cardSub}</div>
    </div>
  </div>
  <div class="card-actions">${actions}</div>
</div>`;
}

// ── Custom card builder ───────────────────────────────────────────────────────
function buildCustomCard(item, i) {
    const isDir = item.isDir;
    const iconKey = isDir ? "folder" : "file";
    const iconSvg = ICONS[iconKey];

    const phId2 = "ph-custom-" + item.name.replace(/[^a-zA-Z0-9]/g, "_");
    const logoTag = item.logo
        ? `<img class="card-logo" id="${phId2}" src="${item.logo}" loading="lazy" onerror="var p=document.createElement('div');p.className='card-logo-ph custom';p.innerHTML=window.ICONS['${iconKey}'];this.parentNode.replaceChild(p,this);">`
        : `<div class="card-logo-ph custom">${iconSvg}</div>`;

    const rmIcon = item.readme
        ? `<span class="readme-icon" title="${t("store.tooltipReadme")}" onclick="openReadme('${esc(item.name)}','${esc(item.readme)}',event)">${ICONS.readme}</span>`
        : "";

    const settingsBtnId =
        "settings-btn-custom-" + item.name.replace(/[^a-zA-Z0-9]/g, "_");

    const actions = renderButtons(CARD_BUTTONS_CUSTOM, {
        name: item.name,
        enabled: item.enabled,
        inst: true,
        settingsBtnId: settingsBtnId,
    });

    const cls = [
        "card custom-card installed",
        !item.enabled ? "item-disabled" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const rmAttr = item.readme
        ? `onclick="openReadme('${esc(item.name)}','${esc(item.readme)}',event)"`
        : "";

    // Schedule async check for handleEvents.json
    setTimeout(
        () => checkAndShowSettingsBtn(item.name, settingsBtnId, true),
        0,
    );

    return `<div class="${cls}" style="animation-delay:${i * 0.048}s" id="card-custom-${item.name}" data-name="${item.name}" ${rmAttr}>
  <div class="card-top">
    ${logoTag}
    <div class="card-meta">
      <div class="card-name"><span class="card-name-text">${item.name}</span>${rmIcon}</div>
      <div class="card-sub">${isDir ? t("store.cardFolderLocal") : t("store.cardFileLocal")}</div>
    </div>
  </div>
  <div class="card-actions">${actions}</div>
</div>`;
}

// ── Load sections ─────────────────────────────────────────────────────────────
async function loadSection(section, repoSection, gridId, countId) {
    const grid = document.getElementById(gridId);
    const countEl = document.getElementById(countId);
    try {
        const [items, installed] = await Promise.all([
            fetch("/api/section/" + repoSection).then((r) => r.json()),
            fetch("/api/installed").then((r) => r.json()),
        ]);
        if (items.error) throw new Error(items.error);
        allItems[section] = items;
        countEl.textContent = items.length;
        if (!items.length) {
            grid.innerHTML = `<div class="empty">${t("store.statusNothingFound", { section: repoSection })}</div>`;
            return;
        }
        // Attach install info, then sort: enabled → installed/disabled → not installed
        const itemsWithInst = items.map((f) => {
            const needle = f.name.toLowerCase();
            const inst =
                installed.find(
                    (e) =>
                        e.name === needle ||
                        e.name.includes(needle) ||
                        needle.includes(e.name),
                ) || null;
            return { f, inst };
        });
        itemsWithInst.sort((a, b) => {
            const rankA = a.inst ? (a.inst.enabled ? 0 : 1) : 2;
            const rankB = b.inst ? (b.inst.enabled ? 0 : 1) : 2;
            return rankA - rankB;
        });
        grid.innerHTML = itemsWithInst
            .map(({ f, inst }, i) => buildCard(f, i, section, inst))
            .join("");
        // Check for updates on installed submodule items (non-blocking)
        itemsWithInst.forEach(({ f, inst }) => {
            if (inst && f.submodule && f.subUrl) {
                checkSubmoduleUpdate(f, section);
            }
        });
        return true;
    } catch (e) {
        grid.innerHTML = `<div class="empty">${t("store.statusFailedLoad", { section: repoSection })}<br><code>${e.message}</code></div>`;
        return false;
    }
}

async function loadCustom() {
    const grid = document.getElementById("grid-custom");
    const countEl = document.getElementById("tc-custom");
    const tabBtn = document.getElementById("tab-custom");
    // Вкладка custom присутствует только в офлайн-режиме
    if (!grid || !countEl || !tabBtn) return;
    try {
        const known = [...allItems.addons, ...allItems.themes].map(
            (f) => f.name,
        );
        const r = await fetch(
            "/api/custom?known=" + encodeURIComponent(JSON.stringify(known)),
        );
        const items = await r.json();
        allItems.custom = items;
        countEl.textContent = items.length;
        tabBtn.style.display = items.length > 0 ? "" : "none";
        if (!items.length) {
            grid.innerHTML = `<div class="empty">${t("store.statusEmptyCustom")}</div>`;
            return;
        }
        grid.innerHTML = items
            .map((item, i) => buildCustomCard(item, i))
            .join("");
    } catch (e) {
        if (grid)
            grid.innerHTML = `<div class="empty">${t("store.statusFailedLoad", { section: t("store.tabInstalled") })}<br><code>${e.message}</code></div>`;
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────
function startDownloadProgress(btn) {
    btn.disabled = true;
    btn.dataset.downloading = "1";
    btn.innerHTML = `${t("store.btnDownloading")}`;
    return null;
}

function finishDownloadProgress(btn, overlay) {
    delete btn.dataset.downloading;
    btn.disabled = false;
}

async function doDownload(argsJson, btn, event) {
    event && event.stopPropagation();
    if (btn.dataset.downloading) return;
    const args = JSON.parse(argsJson);
    const overlay = startDownloadProgress(btn);
    const data = await api("/api/download", args).catch((e) => ({
        ok: false,
        error: e.message,
    }));
    finishDownloadProgress(btn, overlay);
    if (data.ok) {
        const cid = args.section + "-" + args.name;
        const card = document.getElementById("card-" + cid);
        if (card) {
            card.classList.add("installed");
            card.classList.remove("item-disabled");
            const settingsBtnId =
                "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_");
            card.querySelector(".card-actions").innerHTML = renderButtons(
                CARD_BUTTONS_AFTER_DOWNLOAD,
                {
                    name: args.name,
                    enabled: true,
                    inst: true,
                    settingsBtnId,
                },
            );
            checkAndShowSettingsBtn(args.name, settingsBtnId, true);
            const ob = card.querySelector(".badge");
            if (ob) ob.remove();
        }
        showRestartBanner();
        broadcastChange("downloaded", {
            name: args.name,
            section: args.section,
        });
        setTimeout(loadInstalled, 300);
    } else {
        setTimeout(() => {
            setBtn(
                btn,
                '<span class="sb sb-err">✗ ' +
                    (data.error || t("store.statusError")) +
                    "</span>",
                false,
            );
            setTimeout(() => {
                btn.innerHTML = t("store.btnDownload");
                btn.disabled = false;
            }, 3000);
        }, 290);
    }
}

// ── Submodule update check ────────────────────────────────────────────────────
async function checkSubmoduleUpdate(f, section) {
    if (!f.submodule || !f.subUrl) return;
    const cid = section + "-" + f.name;
    const card = document.getElementById("card-" + cid);
    if (!card || !card.classList.contains("installed")) return;
    try {
        const params = new URLSearchParams({ name: f.name, subUrl: f.subUrl });
        const result = await fetch("/api/check-update?" + params).then((r) =>
            r.json(),
        );
        if (!result.hasUpdate) return;
        const actions = card.querySelector(".card-actions");
        if (!actions) return;
        // Don't add duplicate update button
        if (actions.querySelector(".btn-update")) return;
        const dlArg = encodeURIComponent(
            JSON.stringify({
                name: f.name,
                folderPath: f.path,
                section,
                submodule: true,
                subUrl: f.subUrl,
            }),
        );
        // Determine current enabled state from existing toggle button
        const existingToggle = actions.querySelector(".btn-on, .btn-off");
        const isEnabled = existingToggle
            ? existingToggle.classList.contains("btn-on")
            : true;
        const settingsBtnId =
            "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_");
        // Re-render all buttons according to CARD_BUTTONS_WITH_UPDATE order.
        // "toggle" will be in icon-mode because "update" is present in the array.
        const hasUpdate = CARD_BUTTONS_WITH_UPDATE.includes("update");
        actions.innerHTML = renderButtons(CARD_BUTTONS_WITH_UPDATE, {
            name: f.name,
            enabled: isEnabled,
            inst: true,
            isIconMode: hasUpdate,
            settingsBtnId,
            updateDlArg: dlArg,
        });
    } catch {
        // silently ignore check errors
    }
}

async function doUpdate(argsJson, btn, event) {
    event && event.stopPropagation();
    if (btn.dataset.downloading) return;
    const args = JSON.parse(argsJson);
    btn.dataset.downloading = "1";
    btn.disabled = true;
    btn.innerHTML = `${t("store.btnUpdating")}`;
    const data = await api("/api/download", args).catch((e) => ({
        ok: false,
        error: e.message,
    }));
    delete btn.dataset.downloading;
    if (data.ok) {
        // Re-render card actions back to normal installed state (no update button)
        const actions = btn.closest(".card-actions");
        if (actions) {
            const card = actions.closest(".card");
            const existingToggle = actions.querySelector(".btn-on, .btn-off");
            const isEnabled = existingToggle
                ? existingToggle.classList.contains("btn-on")
                : true;
            const cardId = card ? card.id.replace(/^card-/, "") : "";
            const settingsBtnId =
                "settings-btn-" + cardId.replace(/[^a-zA-Z0-9]/g, "_");
            actions.innerHTML = renderButtons(CARD_BUTTONS_INSTALLED, {
                name: args.name,
                enabled: isEnabled,
                inst: true,
                isIconMode: false,
                settingsBtnId,
            });
        }
        showRestartBanner();
        broadcastChange("downloaded", {
            name: args.name,
            section: args.section,
        });
        setTimeout(loadInstalled, 300);
    } else {
        btn.disabled = false;
        btn.innerHTML = `<span class="sb sb-err">✗ ${data.error || t("store.statusError")}</span>`;
        setTimeout(() => {
            btn.innerHTML = t("store.btnUpdate");
        }, 3000);
    }
}

async function doToggle(name, btn, event) {
    event && event.stopPropagation();
    if (btn.dataset.pending) return;
    btn.dataset.pending = "1";
    const wasEnabled = btn.classList.contains("btn-on");
    btn.dataset.prevHtml = btn.innerHTML;
    btn.innerHTML = SP();
    const data = await api("/api/toggle", { name }).catch((e) => ({
        ok: false,
        error: e.message,
    }));
    delete btn.dataset.pending;
    delete btn.dataset.prevHtml;
    if (data.ok) {
        const card = btn.closest(".card");
        const nowEnabled = !wasEnabled;
        const isIconMode = btn.classList.contains("btn-toggle-icon");
        if (nowEnabled) {
            btn.className =
                "btn btn-on" + (isIconMode ? " btn-toggle-icon" : "");
            btn.innerHTML = isIconMode ? ICONS.disable : t("store.btnDisable");
            btn.title = isIconMode ? t("store.tooltipDisable") : "";
            card && card.classList.remove("item-disabled");
        } else {
            btn.className =
                "btn btn-off" + (isIconMode ? " btn-toggle-icon" : "");
            btn.innerHTML = isIconMode ? ICONS.enable : t("store.btnEnable");
            btn.title = isIconMode ? t("store.tooltipEnable") : "";
            card && card.classList.add("item-disabled");
        }
        showRestartBanner();
        broadcastChange("toggled", { name, enabled: nowEnabled });
    } else {
        btn.className = wasEnabled ? "btn btn-on" : "btn btn-off";
        btn.innerHTML = wasEnabled
            ? t("store.btnDisable")
            : t("store.btnEnable");
        const errSpan = document.createElement("span");
        errSpan.className = "sb sb-err";
        errSpan.style.cssText = "margin-left:6px";
        errSpan.textContent = "⚠ Error";
        btn.after(errSpan);
        setTimeout(() => errSpan.remove(), 2000);
    }
}

async function doDelete(name, btn, event) {
    event && event.stopPropagation();
    setBtn(btn, SP(), true);
    const data = await api("/api/delete", { name }).catch((e) => ({
        ok: false,
        error: e.message,
    }));
    if (data.ok) {
        const card = btn.closest(".card");
        if (card) {
            const inCustom = !!card.closest("#grid-custom");
            const inInstalled = !!card.closest("#grid-installed");
            if (inCustom || inInstalled) {
                card.style.animation = "fu .3s ease reverse";
                setTimeout(() => {
                    card.remove();
                    if (inCustom) {
                        const customGrid =
                            document.getElementById("grid-custom");
                        const remaining = customGrid
                            ? customGrid.querySelectorAll(".card").length
                            : 0;
                        document.getElementById("tc-custom").textContent =
                            remaining;
                        if (remaining === 0)
                            document.getElementById(
                                "tab-custom",
                            ).style.display = "none";
                    }
                    // Refresh installed tab
                    setTimeout(loadInstalled, 100);
                }, 280);
            } else {
                card.classList.remove("installed", "item-disabled");
                const itemName = card.dataset.name;
                const section = card.id.startsWith("card-themes")
                    ? "themes"
                    : "addons";
                const allSectionItems = allItems[section] || [];
                const f = allSectionItems.find((x) => x.name === itemName);
                if (f) {
                    const dlArg = encodeURIComponent(
                        JSON.stringify({
                            name: f.name,
                            folderPath: f.path,
                            section,
                            submodule: !!f.submodule,
                            subUrl: f.subUrl || "",
                        }),
                    );
                    card.querySelector(".card-actions").innerHTML =
                        `<button class="btn btn-primary" onclick="doDownload(decodeURIComponent('${dlArg}'),this,event)">Download</button>`;
                }
                card.querySelectorAll(".badge").forEach((b) => b.remove());
                setTimeout(loadInstalled, 300);
            }
        }
        showRestartBanner();
        // Determine section for broadcast (to update addons/themes grids on other tabs)
        let deletedSection = null;
        if (card) {
            if (card.id.startsWith("card-themes")) deletedSection = "themes";
            else if (card.id.startsWith("card-addons"))
                deletedSection = "addons";
        }
        broadcastChange("deleted", { name, section: deletedSection });
    } else {
        setBtn(btn, ICONS.trash, false);
    }
}

// ── Render installed grid from in-memory data (instant, no network) ───────────
function renderInstalled(all) {
    const grid = document.getElementById("grid-installed");
    const countEl = document.getElementById("tc-installed");
    all.sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));
    allItems.installed = all;
    countEl.textContent = all.length;
    if (!all.length) {
        grid.innerHTML = `<div class="empty">${t("store.statusEmptyInstalled")}</div>`;
        return;
    }
    grid.innerHTML = all.map((item, i) => buildCustomCard(item, i)).join("");
}

// ── Load installed (all items from Addons folder) ─────────────────────────────
async function loadInstalled(instant = false) {
    const grid = document.getElementById("grid-installed");
    const countEl = document.getElementById("tc-installed");

    // Instant render: if we already have custom/installed data cached, show it immediately
    if (instant && allItems.custom && allItems.custom.length > 0) {
        renderInstalled([...allItems.custom]);
    }

    try {
        // Also fetch custom entries with empty known list to get everything
        const all = await fetch(
            "/api/custom?known=" + encodeURIComponent(JSON.stringify([])),
        ).then((r) => r.json());
        renderInstalled(all);
    } catch (e) {
        // Don't overwrite instant render with an error if we already showed something
        if (!allItems.installed || !allItems.installed.length) {
            grid.innerHTML = `<div class="empty">${t("store.statusFailedLoadInstalled")}<br><code>${e.message}</code></div>`;
        }
    }
}

// ── Boot: all three load in parallel, Installed never waits for Addons/Themes ──
loadInstalled(); // fires immediately, independent

Promise.all([
    loadSection("addons", "Addons", "grid-addons", "tc-addons"),
    loadSection("themes", "Themes", "grid-themes", "tc-themes"),
]).then((results) => {
    const serverAvailable = results.some(Boolean);
    if (!serverAvailable) {
        const tabCustom = document.getElementById("tab-custom");
        if (tabCustom) {
            tabCustom.style.display = "";
            tabCustom.innerHTML = `${ICONS.folder} Local<span class="tc tc-custom" id="tc-custom">…</span>`;
        }
        const secLabel = document.querySelector("#panel-custom .sec-label");
        if (secLabel) secLabel.textContent = t("store.sectionLocal");
        const addonsTab = document.querySelector(".tab.active");
        if (addonsTab) addonsTab.classList.remove("active");
        if (tabCustom) tabCustom.classList.add("active");
        document
            .querySelectorAll(".panel")
            .forEach((p) => p.classList.remove("active"));
        const panelCustom = document.getElementById("panel-custom");
        if (panelCustom) panelCustom.classList.add("active");
        currentTab = "custom";
    }
    loadCustom();
});

// Expose to window
window.switchTab = switchTab;
window.onSearch = onSearch;

window.closeModal = closeModal;
window.closeEditorModal = closeEditorModal;
window.saveHandleEvents = saveHandleEvents;

window.openReadme = openReadme;
window.openInBrowser = openInBrowser;

window.doDownload = doDownload;
window.doUpdate = doUpdate;
window.doToggle = doToggle;
window.doDelete = doDelete;

window.openHandleEvents = openHandleEvents;

window.doReload = doReload;
