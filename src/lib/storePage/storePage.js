import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { BrowserWindow, protocol } from "electron";

import { handleRequest } from "./requestHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "public");

// ── Skeleton cards (rendered into HTML before serving) ──

function SKELS(n) {
    return Array.from(
        { length: n },
        () => `
<div class="card">
  <div class="card-top">
    <div class="skel" style="width:44px;height:44px;border-radius:9px;flex-shrink:0"></div>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px;padding-top:2px">
      <div class="skel" style="width:62%"></div>
      <div class="skel" style="width:36%;height:10px"></div>
    </div>
  </div>
  <div class="skel" style="height:33px;border-radius:8px"></div>
</div>`,
    ).join("");
}

// ── Electron custom protocol ──

export function setupStorePage() {
    protocol.handle("nextstore", async (request) => {
        const url = new URL(request.url);
        const urlPath = url.pathname;
        const qp = Object.fromEntries(url.searchParams);
        const method = request.method;

        const getBody = () =>
            request
                .arrayBuffer()
                .then((ab) => Buffer.from(ab).toString("utf8"));

        try {
            const result = await handleRequest(
                method,
                urlPath,
                qp,
                getBody,
                PUBLIC_DIR,
            );
            return new Response(result.body, {
                status: result.status,
                headers: result.headers,
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }
    });
}

// ── HTML helpers ──

export function getStoreHtml() {
    const htmlPath = path.join(PUBLIC_DIR, "index.html");
    let html = fs.readFileSync(htmlPath, "utf8");
    html = html
        .replace("SKELS_ADDONS", SKELS(6))
        .replace("SKELS_THEMES", SKELS(6))
        .replace(
            /\/(public\/[^"']+)/g,
            (_, p) =>
                pathToFileURL(path.join(PUBLIC_DIR, p.replace(/^public\//, "")))
                    .href,
        )
        .replace("<head>", `<head>\n        <base href="nextstore://app/">`);
    return html;
}

export function injectStoreHtml(win) {
    const html = getStoreHtml();
    win.webContents.executeJavaScript(
        `window.__nextStoreHtml = ${JSON.stringify(html)};`,
    );
}
