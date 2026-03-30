// ── Локализация (langManager на клиенте) ─────────────────────────────────────

let _lang = {};

async function loadLang() {
    try {
        const res = await fetch("/api/lang");
        const text = await res.text();
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

function applyStaticI18n() {
    const closeBtn = document.querySelector(".store-close-btn");
    if (closeBtn) closeBtn.title = t("store.tooltipClose");

    const tabAddons = document.querySelector("[onclick*=\"switchTab('addons'\"]");
    const tabThemes = document.querySelector("[onclick*=\"switchTab('themes'\"]");
    const tabInstalled = document.querySelector("[onclick*=\"switchTab('installed'\"]");
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

    const searchBox = document.getElementById("search-box");
    if (searchBox) searchBox.placeholder = t("store.searchPlaceholder");

    const secAddons = document.querySelector("#panel-addons .sec-label");
    if (secAddons) secAddons.textContent = t("store.sectionAddons");
    const secThemes = document.querySelector("#panel-themes .sec-label");
    if (secThemes) secThemes.textContent = t("store.sectionThemes");
    const secInstalled = document.querySelector("#panel-installed .sec-label");
    if (secInstalled) secInstalled.textContent = t("store.sectionInstalled");

    const editorBadge = document.querySelector(".editor-modal-badge");
    if (editorBadge) editorBadge.textContent = t("store.modalEditorBadge");
    const cancelBtn = document.querySelector(".btn-editor-cancel");
    if (cancelBtn) cancelBtn.textContent = t("store.btnCancel");
    const saveBtn = document.querySelector(".btn-editor-save");
    if (saveBtn) saveBtn.textContent = t("store.btnSave");
}
