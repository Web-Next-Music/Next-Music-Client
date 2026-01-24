(function nextTitleObserver() {
    const REQUIRED_TITLE = "Next Music";

    if (document.title !== REQUIRED_TITLE) {
        document.title = REQUIRED_TITLE;
    }

    const titleElement = document.querySelector("title");

    if (!titleElement) {
        return;
    }

    const observer = new MutationObserver(() => {
        if (document.title !== REQUIRED_TITLE) {
            document.title = REQUIRED_TITLE;
        }
    });

    observer.observe(titleElement, {
        childList: true,
    });

    window.stopNextTitleObserver = () => observer.disconnect();
})();
