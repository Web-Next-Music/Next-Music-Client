(function hardNextTitleShield() {
    const REQUIRED_TITLE = "Next Music";

    document.title = REQUIRED_TITLE;

    function enforceTitle() {
        if (document.title !== REQUIRED_TITLE) {
            document.title = REQUIRED_TITLE;
        }
        const titleEl = document.querySelector("title");
        if (titleEl && titleEl.textContent !== REQUIRED_TITLE) {
            titleEl.textContent = REQUIRED_TITLE;
        }
    }

    Object.defineProperty(document, "title", {
        configurable: true,
        enumerable: true,
        get() {
            return REQUIRED_TITLE;
        },
        set(_) {
            enforceTitle();
        },
    });

    const observer = new MutationObserver(enforceTitle);
    observer.observe(document.head || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    const interval = setInterval(enforceTitle, 500);

    window.stopNextTitleShield = () => {
        observer.disconnect();
        clearInterval(interval);
    };
})();
