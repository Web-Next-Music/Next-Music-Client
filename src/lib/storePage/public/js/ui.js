// ── State ─────────────────────────────────────────────────────────────────────
let currentTab = "addons";
const allItems = { addons: [], themes: [], custom: [], installed: [] };
let restartNeeded = false;

// ── Apply CSS vars from parent window ────────────────────────────────────────
(async () => {
    const vars = await fetch("/api/theme-vars").then((r) => r.json());
    if (!vars) return;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
})();

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
    requestAnimationFrame(() => banner.classList.add("visible"));
}

async function doReload() {
    try {
        await fetch("/api/reload", { method: "POST" });
    } catch {
        // ignore
    }
    location.reload(true);
}

function checkNeedsRestart(data) {
    if (data && data.hasJs !== undefined) return data.hasJs;
    return true;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(n, el) {
    currentTab = n;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
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
