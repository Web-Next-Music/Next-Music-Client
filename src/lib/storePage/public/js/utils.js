// ── Utilities ─────────────────────────────────────────────────────────────────
const SP = () => '<span class="spin"></span>';

function setBtn(b, h, d) {
    b.innerHTML = h;
    b.disabled = !!d;
}

async function api(url, body) {
    const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return r.json();
}

function esc(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ── Open URL in system browser ────────────────────────────────────────────────
function openInBrowser(url, event) {
    event && event.preventDefault();
    event && event.stopPropagation();
    fetch("/api/open-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    }).catch(() => {});
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function md2html(t) {
    const e = (s) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    t = t.replace(
        /```[\w]*\n?([\s\S]*?)```/g,
        (_, c) => "<pre><code>" + e(c.trim()) + "</code></pre>",
    );
    t = t.replace(/`([^`\n]+)`/g, (_, c) => "<code>" + e(c) + "</code>");
    t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    t = t.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>',
    );
    t = t.replace(/^#{3} (.+)$/gm, "<h3>$1</h3>");
    t = t.replace(/^#{2} (.+)$/gm, "<h2>$1</h2>");
    t = t.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
    t = t.replace(/^---+$/gm, "<hr>");
    t = t.replace(/^[\*\-] (.+)$/gm, "<li>$1</li>");
    t = t.replace(/(<li>[\s\S]*?<\/li>)/g, (s) => "<ul>" + s + "</ul>");
    t = t
        .split(/\n\n+/)
        .map((b) =>
            b.trim().startsWith("<")
                ? b
                : "<p>" + b.replace(/\n/g, " ") + "</p>",
        )
        .join("\n");
    return t;
}
