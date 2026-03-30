// ── Button renderer ───────────────────────────────────────────────────────────
// ctx = { name, enabled, inst, cid, settingsBtnId, dlArg, updateDlArg, isIconMode }
function renderButtons(order, ctx) {
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

// ── Card builder (store items: Addons / Themes) ────────────────────────────────
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

    const settingsBtnId = "settings-btn-" + cid.replace(/[^a-zA-Z0-9]/g, "_");

    let actions;
    if (inst) {
        actions = renderButtons(CARD_BUTTONS_INSTALLED, {
            name: f.name,
            enabled,
            inst: true,
            settingsBtnId,
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
            settingsBtnId,
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

    if (inst) {
        setTimeout(() => checkAndShowSettingsBtn(f.name, settingsBtnId, true), 0);
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
        settingsBtnId,
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
