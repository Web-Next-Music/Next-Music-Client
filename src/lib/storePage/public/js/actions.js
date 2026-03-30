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
        ["grid-installed", "grid-custom"].forEach((gridId) => {
            const card = document.querySelector(
                `#${gridId} [data-name="${name}"]`,
            );
            if (card) card.remove();
        });
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

// ── Download ──────────────────────────────────────────────────────────────────
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

        const existingToggle = actions.querySelector(".btn-on, .btn-off");
        const isEnabled = existingToggle
            ? existingToggle.classList.contains("btn-on")
            : true;

        const settingsBtnId =
            "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_");
        const hasUpdate = CARD_BUTTONS_WITH_UPDATE.includes("update");

        actions.innerHTML = renderButtons(CARD_BUTTONS_WITH_UPDATE, {
            name: f.name,
            enabled: isEnabled,
            inst: true,
            isIconMode: hasUpdate,
            settingsBtnId,
            updateDlArg: dlArg,
        });

        // FIX: re-run settings button visibility check after re-render
        checkAndShowSettingsBtn(f.name, settingsBtnId, true);
    } catch {
        // silently ignore
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

            // FIX: re-run settings button visibility check after update completes
            checkAndShowSettingsBtn(args.name, settingsBtnId, true);
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

// ── Toggle ────────────────────────────────────────────────────────────────────
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

// ── Delete ────────────────────────────────────────────────────────────────────
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
