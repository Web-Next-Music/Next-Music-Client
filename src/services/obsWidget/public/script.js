const log = (...a) => console.log("[OBS-WIDGET-CLIENT]", ...a);
const ws = new WebSocket("ws://localhost:4091");

ws.onopen = () => log("WebSocket connected");
ws.onclose = () => log("WebSocket disconnected");

ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    log("Track update", data);

    document.getElementById("cover").src = data.cover || "";
    document.getElementById("title").textContent = data.title || "";
    document.getElementById("artist").textContent = data.artist || "";
    document.getElementById("widget").style.backgroundColor = data.color || "";
};
