(function () {
    if (document.getElementById("nmc-titlebar")) return;
    if (!window.nmcWindow) return;

    const ICONS = {
        minimize: `<svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0.5H10" stroke="currentColor" stroke-width="1"/>
        </svg>`,
        maximize: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" stroke-width="1"/>
        </svg>`,
        restore: `<svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3.5" y="0.5" width="7" height="7" rx="0.5" stroke="currentColor" stroke-width="1"/>
            <path d="M0.5 3.5V10.5H7.5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        close: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
        </svg>`,
    };

    const bar = document.createElement("div");
    bar.id = "nmc-titlebar";

    const right = document.createElement("div");
    right.className = "nmc-tb-right";

    if (window.__nmcTitleBarConfig?.showNextText) {
        const label = document.createElement("span");
        label.className = "nextText";
        const version = window.__nmcTitleBarConfig?.version || "";
        label.textContent = `Next Music ${version}`;
        right.appendChild(label);
    }

    const buttons = document.createElement("div");
    buttons.className = "nmc-tb-buttons";

    const btnMin = document.createElement("button");
    btnMin.className = "nmc-tb-btn nmc-minimize";
    btnMin.innerHTML = ICONS.minimize;
    btnMin.addEventListener("click", () => window.nmcWindow.minimize());

    const btnMax = document.createElement("button");
    btnMax.className = "nmc-tb-btn nmc-maximize";
    btnMax.innerHTML = ICONS.maximize;
    btnMax.addEventListener("click", () => window.nmcWindow.maximize());

    const btnClose = document.createElement("button");
    btnClose.className = "nmc-tb-btn nmc-close";
    btnClose.innerHTML = ICONS.close;
    btnClose.addEventListener("click", () => window.nmcWindow.close());

    buttons.appendChild(btnMin);
    buttons.appendChild(btnMax);
    buttons.appendChild(btnClose);
    right.appendChild(buttons);
    bar.appendChild(right);
    document.documentElement.prepend(bar);

    bar.addEventListener("dblclick", (e) => {
        if (e.target === btnMin || e.target === btnMax || e.target === btnClose)
            return;
        window.nmcWindow.maximize();
    });

    function updateMaxIcon(isMax) {
        btnMax.innerHTML = isMax ? ICONS.restore : ICONS.maximize;
    }

    window.nmcWindow.isMaximized().then(updateMaxIcon);
    window.nmcWindow.removeMaximizeListeners();
    window.nmcWindow.onMaximizeChange(updateMaxIcon);

    // ── Theme observer ──────────────────────────────────────────────────────
    function applyTheme() {
        const isDark = document.body.classList.contains("ym-dark-theme");
        bar.classList.toggle("theme-dark", isDark);
        bar.classList.toggle("theme-light", !isDark);
    }

    applyTheme();

    const titlebarObserver = new MutationObserver(() => applyTheme());
    titlebarObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
    });
})();
