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
    enable: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><polygon points="5,3 13,8 5,13"/></svg>`,
    disable: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>`,
    trash: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9"/><path d="M7 7v4M9 7v4"/></svg>`,
    readme: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h6l3 3v9H4V2z"/><path d="M10 2v3h3"/><path d="M6 8h4M6 11h3"/></svg>`,
    addon: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="5" height="5" rx="1"/><rect x="13" y="7" width="5" height="5" rx="1"/><rect x="7.5" y="2" width="5" height="5" rx="1"/><rect x="7.5" y="13" width="5" height="5" rx="1"/><path d="M7 9.5H7.5M12.5 9.5H13M10 7V7.5M10 12.5V13"/></svg>`,
    theme: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><path d="M10 3v14M3 10h14" stroke-dasharray="2 2"/><circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" opacity=".4"/></svg>`,
    folder: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`,
    file: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h7l4 4v12H5V2z"/><path d="M12 2v4h4"/></svg>`,
    warning: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13h13L8 2z"/><path d="M8 7v3"/><circle cx="8" cy="11.5" r=".7" fill="currentColor"/></svg>`,
    custom: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z"/></svg>`,
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
        <span class="restart-text">Restart required to apply changes</span>
        <button class="btn-restart" onclick="doReload()">Restart</button>`;
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
        noR.textContent = 'No results for "' + q + '"';
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
    document.getElementById("modal-title").textContent = name + " — README";
    document.getElementById("modal-body").innerHTML =
        '<div class="modal-loading">' + SP() + " Loading…</div>";
    document.getElementById("modal-bg").classList.remove("hidden");
    try {
        const isLocal = readmeUrl.startsWith("/api/local-readme");
        const fetchUrl = isLocal
            ? readmeUrl
            : "/api/readme?url=" + encodeURIComponent(readmeUrl);
        const r = await fetch(fetchUrl);
        document.getElementById("modal-body").innerHTML = md2html(
            await r.text(),
        );
    } catch {
        document.getElementById("modal-body").innerHTML =
            '<div class="modal-loading">Failed to load README.</div>';
    }
}
function closeModal() {
    document.getElementById("modal-bg").classList.add("hidden");
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});

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
        ? `<span class="readme-icon" title="README" onclick="openReadme('${esc(f.name)}','${esc(f.readme)}',event)">${ICONS.readme}</span>`
        : "";

    let actions;
    if (inst) {
        const tc = enabled ? "btn-on" : "btn-off";
        const tl = enabled ? `Disable` : `Enable`;
        actions = `<button class="btn ${tc}" onclick="doToggle('${esc(f.name)}',this,event)">${tl}</button><button class="btn btn-danger" onclick="doDelete('${esc(f.name)}',this,event)" title="Delete">${ICONS.trash}</button>`;
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
        actions = `<button class="btn btn-primary" onclick="doDownload(decodeURIComponent('${dlArg}'),this,event)">Download</button>`;
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
            cardSub = `${section === "themes" ? "Themes" : "Addons"} / ${f.name}`;
        }
    } else {
        cardSub = `${section === "themes" ? "Themes" : "Addons"} / ${f.name}`;
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
        ? `<span class="readme-icon" title="README" onclick="openReadme('${esc(item.name)}','${esc(item.readme)}',event)">${ICONS.readme}</span>`
        : "";

    const tc = item.enabled ? "btn-on" : "btn-off";
    const tl = item.enabled ? `Disable` : `Enable`;
    const actions = `<button class="btn ${tc}" onclick="doToggle('${esc(item.name)}',this,event)">${tl}</button><button class="btn btn-danger" onclick="doDelete('${esc(item.name)}',this,event)" title="Delete">${ICONS.trash}</button>`;

    const cls = [
        "card custom-card installed",
        !item.enabled ? "item-disabled" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const rmAttr = item.readme
        ? `onclick="openReadme('${esc(item.name)}','${esc(item.readme)}',event)"`
        : "";

    return `<div class="${cls}" style="animation-delay:${i * 0.048}s" id="card-custom-${item.name}" data-name="${item.name}" ${rmAttr}>
  <div class="card-top">
    ${logoTag}
    <div class="card-meta">
      <div class="card-name"><span class="card-name-text">${item.name}</span>${rmIcon}</div>
      <div class="card-sub">${isDir ? "Folder" : "File"} — local</div>
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
            grid.innerHTML = `<div class="empty">Nothing found in ${repoSection}.</div>`;
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
        grid.innerHTML = `<div class="empty">Failed to load ${repoSection}.<br><code>${e.message}</code></div>`;
        return false;
    }
}

async function loadCustom() {
    const grid = document.getElementById("grid-custom");
    const countEl = document.getElementById("tc-custom");
    const tabBtn = document.getElementById("tab-custom");
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
            grid.innerHTML = '<div class="empty">No custom files found.</div>';
            return;
        }
        grid.innerHTML = items
            .map((item, i) => buildCustomCard(item, i))
            .join("");
    } catch (e) {
        grid.innerHTML = `<div class="empty">Failed to load custom items.<br><code>${e.message}</code></div>`;
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────
function startDownloadProgress(btn) {
    btn.disabled = true;
    btn.dataset.downloading = "1";
    btn.innerHTML = `Downloading…`;
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
            card.querySelector(".card-actions").innerHTML =
                `<button class="btn btn-on" onclick="doToggle('${esc(args.name)}',this,event)">${ICONS.disable} Disable</button><button class="btn btn-danger" onclick="doDelete('${esc(args.name)}',this,event)" title="Delete">${ICONS.trash}</button>`;
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
                    (data.error || "Error") +
                    "</span>",
                false,
            );
            setTimeout(() => {
                btn.innerHTML = `Download`;
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
        const updateBtn = document.createElement("button");
        updateBtn.className = "btn btn-primary btn-update";
        updateBtn.title = "Update available";
        updateBtn.innerHTML = `Update`;
        updateBtn.onclick = (event) =>
            doUpdate(decodeURIComponent(dlArg), updateBtn, event);
        actions.insertBefore(updateBtn, actions.firstChild);
        // Collapse the toggle button to icon-only mode
        const toggleBtn = actions.querySelector(".btn-on, .btn-off");
        if (toggleBtn) {
            toggleBtn.classList.add("btn-toggle-icon");
            toggleBtn.dataset.fullHtml = toggleBtn.innerHTML;
            // Keep only the SVG icon
            const isEnabled = toggleBtn.classList.contains("btn-on");
            toggleBtn.innerHTML = isEnabled ? ICONS.disable : ICONS.enable;
            toggleBtn.title = isEnabled ? "Disable" : "Enable";
        }
        actions.insertBefore(updateBtn, actions.firstChild);
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
    btn.innerHTML = `Updating…`;
    const data = await api("/api/download", args).catch((e) => ({
        ok: false,
        error: e.message,
    }));
    delete btn.dataset.downloading;
    if (data.ok) {
        // Restore toggle button to full text before removing update button
        const actions = btn.closest(".card-actions");
        if (actions) {
            const toggleBtn = actions.querySelector(".btn-on, .btn-off");
            if (toggleBtn && toggleBtn.classList.contains("btn-toggle-icon")) {
                toggleBtn.classList.remove("btn-toggle-icon");
                const isEnabled = toggleBtn.classList.contains("btn-on");
                toggleBtn.innerHTML = isEnabled ? `Disable` : `Enable`;
                toggleBtn.title = "";
            }
        }
        btn.remove();
        showRestartBanner();
        broadcastChange("downloaded", {
            name: args.name,
            section: args.section,
        });
        setTimeout(loadInstalled, 300);
    } else {
        btn.disabled = false;
        btn.innerHTML = `<span class="sb sb-err">✗ ${data.error || "Error"}</span>`;
        setTimeout(() => {
            btn.innerHTML = `Update`;
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
            btn.innerHTML = isIconMode ? ICONS.disable : `Disable`;
            btn.title = isIconMode ? "Disable" : "";
            card && card.classList.remove("item-disabled");
        } else {
            btn.className =
                "btn btn-off" + (isIconMode ? " btn-toggle-icon" : "");
            btn.innerHTML = isIconMode ? ICONS.enable : `Enable`;
            btn.title = isIconMode ? "Enable" : "";
            card && card.classList.add("item-disabled");
        }
        showRestartBanner();
        broadcastChange("toggled", { name, enabled: nowEnabled });
    } else {
        btn.className = wasEnabled ? "btn btn-on" : "btn btn-off";
        btn.innerHTML = wasEnabled ? `Disable` : `Enable`;
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
        grid.innerHTML =
            '<div class="empty">No installed extensions found.</div>';
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
            grid.innerHTML = `<div class="empty">Failed to load installed items.<br><code>${e.message}</code></div>`;
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
        if (secLabel) secLabel.textContent = "Local — installed extensions";
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
