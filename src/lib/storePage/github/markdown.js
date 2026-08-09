import crypto from "crypto";
import { getEntry, isFresh, setEntry, touchEntry } from "../cache.js";
import { CONTENTS_TTL, authHeader, httpsGet, httpsPost } from "./httpClient.js";

export function markdownContext(url) {
	const m = String(url || "").match(
		/^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^/]+)\/([^/]+)/i,
	);
	return m ? `${m[1]}/${m[2]}` : "";
}

export function resolveRelativeUrls(html, base) {
	if (!base) return html;
	return html.replace(/\b(src|href)="([^"]*)"/gi, (full, attr, value) => {
		if (!value || /^(https?:|data:|mailto:|#|\/\/)/i.test(value))
			return full;
		try {
			return `${attr}="${new URL(value, base).href}"`;
		} catch {
			return full;
		}
	});
}

export async function renderMarkdown(md, url, token) {
	if (!md) return "";

	const context = markdownContext(url);
	const hash = crypto.createHash("sha1").update(md).digest("hex");
	const key = `md:${context}:${hash}`;
	const cached = getEntry(key);

	if (isFresh(cached, CONTENTS_TTL)) return cached.v;

	const base = url ? url.replace(/[^/]*$/, "") : "";

	try {
		const r = await httpsPost(
			"https://api.github.com/markdown",
			JSON.stringify({
				text: md,
				mode: context ? "gfm" : "markdown",
				context: context || undefined,
			}),
			authHeader(token),
		);

		if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode}`);

		const html = resolveRelativeUrls(r.body.toString(), base);
		setEntry(key, html);
		return html;
	} catch {
		return cached?.v || "";
	}
}

export async function fetchReadme(url) {
	const key = "readme:" + url;
	const cached = getEntry(key);

	if (isFresh(cached, CONTENTS_TTL)) return cached.v;

	try {
		const r = await httpsGet(
			url,
			cached?.etag ? { "If-None-Match": cached.etag } : {},
		);

		if (r.statusCode === 304 && cached) {
			touchEntry(key);
			return cached.v;
		}

		if (r.statusCode !== 200) throw new Error(`HTTP ${r.statusCode}`);

		const md = r.body.toString();
		setEntry(key, md, r.headers.etag);
		return md;
	} catch {
		return cached?.v || "";
	}
}
