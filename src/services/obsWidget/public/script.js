const log = (...a) => console.log("[OBS-WIDGET-CLIENT]", ...a);
const ws = new WebSocket("ws://localhost:4091");

ws.onopen = () => log("WebSocket connected");
ws.onclose = () => log("WebSocket disconnected");

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);

    document.getElementById("cover").src = data.cover || "assets/icon-256.png";
    document.getElementById("title").textContent = data.title || "";
    document.getElementById("artist").textContent = data.artist || "";
    document.getElementById("widget").style.backgroundColor = data.color || "";
    document.getElementById("ts_start").textContent = data.position || "";
    document.getElementById("ts_end").textContent = data.duration || "";
};

// Progress Bar
const tsStart = document.getElementById("ts_start");
const tsEnd = document.getElementById("ts_end");
const progress = document.getElementById("progress");

function timeToSeconds(time) {
    const [m, s] = time.split(":").map(Number);
    return m * 60 + s;
}

function updateProgressFromText() {
    const current = timeToSeconds(tsStart.textContent);
    const duration = timeToSeconds(tsEnd.textContent);

    if (!duration || isNaN(current)) return;

    const percent = Math.min((current / duration) * 100, 100);
    progress.style.width = percent + "%";
}

// MutationObserver
const observer = new MutationObserver(() => {
    updateProgressFromText();
});

observer.observe(tsStart, {
    characterData: true,
    childList: true,
    subtree: true,
});

// первичная синхронизация
updateProgressFromText();
