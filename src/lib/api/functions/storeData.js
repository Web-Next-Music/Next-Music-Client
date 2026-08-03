const RELEASE_CACHE_KEY = "nmc:nextstore-release-cache";

const _objectUrls = new Set();

let _storeLang = null;

function storeRequest(method, urlPath, qp, body) {
	if (!window.nmcStore) return Promise.reject(new Error("no store bridge"));
	return window.nmcStore.request(method, urlPath, qp || {}, body ?? null);
}

async function storeJson(method, urlPath, qp, body) {
	const res = await storeRequest(method, urlPath, qp, body);
	if (typeof res.body !== "string") throw new Error("expected text body");
	const data = JSON.parse(res.body);
	if (data && data.ok === false) throw new Error(data.error || "failed");
	return data;
}

function splitStorePath(rawUrl) {
	const [path, search = ""] = String(rawUrl).split("?");
	const qp = {};
	for (const [key, value] of new URLSearchParams(search)) qp[key] = value;
	return { path, qp };
}

async function storeObjectUrl(urlPath, qp) {
	const res = await storeRequest("GET", urlPath, qp);
	if (res.status !== 200 || typeof res.body === "string") return null;
	const type = res.headers["Content-Type"] || "image/png";
	const url = URL.createObjectURL(new Blob([res.body], { type }));
	_objectUrls.add(url);
	return url;
}

function loadLogoUrl(item) {
	if (!item.logo) return Promise.resolve(null);
	if (/^https?:/i.test(item.logo)) {
		return storeObjectUrl("/api/logo", { url: item.logo });
	}
	const { path, qp } = splitStorePath(item.logo);
	return storeObjectUrl(path, qp);
}

function releaseObjectUrls() {
	for (const url of _objectUrls) URL.revokeObjectURL(url);
	_objectUrls.clear();
}

async function loadStoreLang() {
	if (_storeLang) return _storeLang;
	try {
		_storeLang = await storeJson("GET", "/api/lang", {});
	} catch {
		_storeLang = {};
	}
	return _storeLang;
}

function t(key, vars) {
	let value = _storeLang;
	for (const part of ("store." + key).split(".")) {
		value = value && value[part];
	}
	if (typeof value !== "string") return key;
	if (!vars) return value;
	return value.replace(/\{(\w+)\}/g, (m, name) =>
		name in vars ? String(vars[name]) : m,
	);
}

function readReleaseCache() {
	try {
		return JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY) || "{}");
	} catch {
		return {};
	}
}

function writeReleaseCache(cache) {
	try {
		localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify(cache));
	} catch {}
}

function syncReleaseCache(info) {
	if (!info || !info.key) return;
	const cache = readReleaseCache();
	cache[info.key] = !!info.hasRelease;
	writeReleaseCache(cache);
}

function parseGithubRepo(subUrl) {
	const m = /github\.com\/([^/]+)\/([^/.]+)/i.exec(String(subUrl || ""));
	return m ? { owner: m[1], repo: m[2] } : null;
}

function openUrlExternal(url) {
	storeJson("POST", "/api/open-url", {}, JSON.stringify({ url })).catch(
		() => {},
	);
}

function md2html(input) {
	const esc = (s) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	let out = input.replace(
		/```[\w]*\n?([\s\S]*?)```/g,
		(_, c) => "<pre><code>" + esc(c.trim()) + "</code></pre>",
	);
	out = out.replace(/`([^`\n]+)`/g, (_, c) => "<code>" + esc(c) + "</code>");
	out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
	out = out.replace(
		/\[([^\]]+)\]\(([^)]+)\)/g,
		'<a href="$2" target="_blank">$1</a>',
	);
	out = out.replace(/^#{3} (.+)$/gm, "<h3>$1</h3>");
	out = out.replace(/^#{2} (.+)$/gm, "<h2>$1</h2>");
	out = out.replace(/^# (.+)$/gm, "<h1>$1</h1>");
	out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
	out = out.replace(/^---+$/gm, "<hr>");
	out = out.replace(/^[*-] (.+)$/gm, "<li>$1</li>");
	out = out.replace(/(<li>[\s\S]*?<\/li>)/g, (s) => "<ul>" + s + "</ul>");

	return out
		.split(/\n\n+/)
		.map((block) =>
			block.trim().startsWith("<")
				? block
				: "<p>" + block.replace(/\n/g, " ") + "</p>",
		)
		.join("\n");
}

const BLOCKED_README_TAGS = new Set([
	"SCRIPT",
	"STYLE",
	"LINK",
	"META",
	"BASE",
	"IFRAME",
	"FRAME",
	"FRAMESET",
	"OBJECT",
	"EMBED",
	"APPLET",
	"FORM",
	"INPUT",
	"BUTTON",
	"TEXTAREA",
	"SELECT",
]);

const URL_ATTRS = new Set(["href", "src", "srcset", "xlink:href", "action"]);

function sanitizeReadme(html) {
	const doc = new DOMParser().parseFromString(
		"<div>" + html + "</div>",
		"text/html",
	);
	const root = doc.body.firstElementChild;

	for (const el of [...root.querySelectorAll("*")]) {
		const tag = el.tagName.toUpperCase();

		if (BLOCKED_README_TAGS.has(tag)) {
			if (tag === "INPUT" && el.getAttribute("type") === "checkbox") {
				el.setAttribute("disabled", "");
			} else {
				el.remove();
				continue;
			}
		}

		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			const value = attr.value.trim();

			if (name.startsWith("on")) el.removeAttribute(attr.name);
			else if (URL_ATTRS.has(name) && !isSafeReadmeUrl(value)) {
				el.removeAttribute(attr.name);
			}
		}
	}

	return root.innerHTML;
}

function isSafeReadmeUrl(value) {
	return !value || /^(https?:|mailto:|data:image\/|#|\/)/i.test(value);
}

async function renderReadmeMarkdown(md, url) {
	try {
		const res = await storeJson(
			"POST",
			"/api/render-markdown",
			{},
			JSON.stringify({ text: md, url }),
		);
		if (res?.html) return res.html;
	} catch {}

	return md2html(md);
}

async function fetchReadmeHtml(item) {
	const url = item.readme;
	if (!url) return null;

	let res;
	if (/^https?:/i.test(url)) {
		res = await storeRequest("GET", "/api/readme", { url });
	} else {
		const { path, qp } = splitStorePath(url);
		res = await storeRequest("GET", path, qp);
	}

	if (res.status !== 200 || typeof res.body !== "string") return null;

	const html = await renderReadmeMarkdown(
		res.body,
		/^https?:/i.test(url) ? url : "",
	);

	return sanitizeReadme(html);
}

const MARKDOWN_STYLE_ID = "nmc-markdown-style";

let _markdownCss = null;

function ensureMarkdownCss() {
	if (_markdownCss) return _markdownCss;

	_markdownCss = storeRequest("GET", "/api/markdown-css")
		.then((res) => {
			if (res.status !== 200 || typeof res.body !== "string") return;
			if (document.getElementById(MARKDOWN_STYLE_ID)) return;

			const style = document.createElement("style");
			style.id = MARKDOWN_STYLE_ID;
			style.textContent = res.body;
			document.head.appendChild(style);
		})
		.catch(() => {});

	return _markdownCss;
}
