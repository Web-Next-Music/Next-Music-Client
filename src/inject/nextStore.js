(() => {
    const LOCAL_URL = "http://127.0.0.1:5037/";
    const ICON_HREF = "/icons/sprite.svg#search_m";

    function getPlusLink() {
        const links = document.querySelectorAll(
            '[class*="NavbarDesktop_navigation"] > ol > li > a',
        );
        return Array.from(links).find((a) => a.href.includes("/plus")) || null;
    }

    function patchLink(a) {
        // Текст
        const div = Array.from(a.querySelectorAll("div")).find((d) =>
            d.textContent.trim(),
        );
        if (div && div.textContent !== "Next Store") {
            div.textContent = "Next Store";
        }

        // Иконка
        const use = a.querySelector("use");
        if (use && use.getAttribute("href") !== ICON_HREF) {
            use.setAttribute("xlink:href", ICON_HREF);
            use.setAttribute("href", ICON_HREF);
        }

        // Клик (только один раз)
        if (!a.dataset.nextStore) {
            a.dataset.nextStore = "true";
            a.addEventListener("click", (e) => {
                e.preventDefault();

                if (document.querySelector("#nextStore_overlay")) return;

                const overlay = document.createElement("div");
                overlay.id = "nextStore_overlay";

                overlay.style.cssText = `
                    position:fixed;
                    inset:0;
                    background:rgba(0,0,0,0.5);
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    z-index: 500;
                    opacity:0;
                    transition:opacity .25s ease;
                `;

                const modal = document.createElement("div");

                modal.style.cssText = `
                    position:relative;
                    width:80%;
                    max-width:1280px;
                    height:90%;
                    max-height:800px;
                    overflow:hidden;
                    background: var(--ym-background-color-primary-enabled-basic);
                    transform:scale(.95);
                    transition:transform .25s ease;
                    box-shadow:0 20px 60px rgba(0,0,0,.6);
                    border-radius: 12px;
                `;

                const iframe = document.createElement("iframe");
                iframe.src = LOCAL_URL;
                iframe.style.cssText = `
                    width:100%;
                    height:100%;
                    border:none;
                    border-radius:12px;
                `;

                modal.appendChild(iframe);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                requestAnimationFrame(() => {
                    overlay.style.opacity = "1";
                    modal.style.transform = "scale(1)";
                });

                function close() {
                    overlay.style.opacity = "0";
                    modal.style.transform = "scale(.95)";
                    setTimeout(() => overlay.remove(), 250);
                }

                overlay.addEventListener("click", (e) => {
                    if (e.target === overlay) close();
                });

                document.addEventListener("keydown", (e) => {
                    if (e.key === "Escape") close();
                });

                function onMessage(e) {
                    if (e.data === "nextStore:close") {
                        close();
                        window.removeEventListener("message", onMessage);
                    }
                }
                window.addEventListener("message", onMessage);
            });
        }
    }

    function watchLink(a) {
        patchLink(a);

        // Наблюдаем только за конкретными элементами: div с текстом и use с иконкой
        const targets = [];

        const div = Array.from(a.querySelectorAll("div")).find((d) =>
            d.textContent.trim(),
        );
        if (div) targets.push(div);

        const use = a.querySelector("use");
        if (use) targets.push(use);

        targets.forEach((target) => {
            const obs = new MutationObserver(() => patchLink(a));
            obs.observe(target, {
                characterData: true,
                childList: true,
                attributes: true,
                attributeFilter: ["href", "xlink:href"],
            });
        });
    }

    // Ждём появления plus-ссылки
    const bodyObserver = new MutationObserver(() => {
        const a = getPlusLink();
        if (a && !a.dataset.nextStore) {
            watchLink(a);
        }
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Проверяем сразу, вдруг уже есть
    const a = getPlusLink();
    if (a) watchLink(a);
})();
