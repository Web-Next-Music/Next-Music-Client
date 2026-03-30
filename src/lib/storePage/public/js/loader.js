// ── Render installed grid from in-memory data ─────────────────────────────────
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

    if (instant && allItems.custom && allItems.custom.length > 0) {
        renderInstalled([...allItems.custom]);
    }

    try {
        const all = await fetch(
            "/api/custom?known=" + encodeURIComponent(JSON.stringify([])),
        ).then((r) => r.json());
        renderInstalled(all);
    } catch (e) {
        if (!allItems.installed || !allItems.installed.length) {
            grid.innerHTML = `<div class="empty">${t("store.statusFailedLoadInstalled")}<br><code>${e.message}</code></div>`;
        }
    }
}

// ── Load a store section (Addons or Themes) ───────────────────────────────────
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

// ── Load custom (offline/local) items ─────────────────────────────────────────
async function loadCustom() {
    const grid = document.getElementById("grid-custom");
    const countEl = document.getElementById("tc-custom");
    const tabBtn = document.getElementById("tab-custom");
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

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    await loadLang();
    applyStaticI18n();
})();

loadInstalled();

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

// ── Expose globals ────────────────────────────────────────────────────────────
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
