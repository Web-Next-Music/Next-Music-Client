// ── README modal ──────────────────────────────────────────────────────────────
async function openReadme(name, readmeUrl, event) {
    event && event.stopPropagation();
    document.getElementById("modal-title").textContent = t(
        "store.modalReadmeTitle",
        { name },
    );
    document.getElementById("modal-body").innerHTML =
        `<div class="modal-loading">${SP()} ${t("store.statusLoading")}</div>`;
    document.getElementById("modal-bg").classList.remove("hidden");
    try {
        const isLocal =
            readmeUrl.startsWith("/api/local-readme") ||
            readmeUrl.includes("/api/local-readme");
        let fetchUrl;
        if (isLocal) {
            fetchUrl = readmeUrl.replace(/^nextstore:\/\/[^/]+/, "");
        } else {
            fetchUrl = "/api/readme?url=" + encodeURIComponent(readmeUrl);
        }
        const r = await fetch(fetchUrl);
        document.getElementById("modal-body").innerHTML = md2html(await r.text());
    } catch {
        document.getElementById("modal-body").innerHTML =
            `<div class="modal-loading">${t("store.statusFailedReadme")}</div>`;
    }
}

function closeModal() {
    document.getElementById("modal-bg").classList.add("hidden");
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (
            !document
                .getElementById("editor-modal-bg")
                .classList.contains("hidden")
        )
            return;
        closeModal();
    }
});
