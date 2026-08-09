import https from "https";
import { getEntry, isFresh, setEntry, touchEntry } from "../cache.js";

export const CONTENTS_TTL = 6 * 60 * 60 * 1000;
export const UPDATE_TTL = 1 * 60 * 60 * 1000;
export const META_TTL = 6 * 60 * 60 * 1000;

export function httpsGet(url, headers = {}, timeout = 15000) {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					"User-Agent": "Next-Music-Store/1.0",
					Accept: "application/vnd.github.v3+json",
					...headers,
				},
			},
			(res) => {
				if (res.statusCode === 301 || res.statusCode === 302)
					return httpsGet(res.headers.location, headers, timeout)
						.then(resolve)
						.catch(reject);
				const c = [];
				res.on("data", (d) => c.push(d));
				res.on("end", () =>
					resolve({
						statusCode: res.statusCode,
						body: Buffer.concat(c),
						headers: res.headers,
					}),
				);
			},
		);
		req.on("error", reject);
		req.setTimeout(timeout, () => {
			req.destroy();
			reject(new Error("Request timeout: " + url));
		});
	});
}

export function httpsPost(url, body, headers = {}, timeout = 15000) {
	return new Promise((resolve, reject) => {
		const payload = Buffer.from(body, "utf8");
		const req = https.request(
			url,
			{
				method: "POST",
				headers: {
					"User-Agent": "Next-Music-Store/1.0",
					Accept: "application/vnd.github.v3+json",
					"Content-Type": "application/json",
					"Content-Length": payload.length,
					...headers,
				},
			},
			(res) => {
				const c = [];
				res.on("data", (d) => c.push(d));
				res.on("end", () =>
					resolve({
						statusCode: res.statusCode,
						body: Buffer.concat(c),
						headers: res.headers,
					}),
				);
			},
		);
		req.on("error", reject);
		req.setTimeout(timeout, () => {
			req.destroy();
			reject(new Error("Request timeout: " + url));
		});
		req.end(payload);
	});
}

export function authHeader(token) {
	return token ? { Authorization: `Bearer ${token}` } : {};
}

export class RateLimitError extends Error {
	constructor(resetAt) {
		super("GitHub API rate limit exceeded");
		this.name = "RateLimitError";
		this.rateLimited = true;
		this.resetAt = resetAt || 0;
	}
}

const rateLimit = { remaining: null, resetAt: 0 };

export function getRateLimitState() {
	const limited = rateLimit.remaining === 0 && Date.now() < rateLimit.resetAt;
	return { limited, resetAt: limited ? rateLimit.resetAt : 0 };
}

export function noteRateLimit(headers) {
	const remaining = headers["x-ratelimit-remaining"];
	const reset = headers["x-ratelimit-reset"];

	if (remaining !== undefined) rateLimit.remaining = Number(remaining);
	if (reset !== undefined) rateLimit.resetAt = Number(reset) * 1000;
}

export function isRateLimitResponse(r) {
	if (r.statusCode !== 403 && r.statusCode !== 429) return false;
	if (r.headers["x-ratelimit-remaining"] === "0") return true;
	return /rate limit/i.test(r.body.toString());
}

const inflight = new Map();

export function cachedGet(url, opts = {}) {
	const key = url + (opts.force ? "!" : "");
	const pending = inflight.get(key);
	if (pending) return pending;

	const request = fetchWithCache(url, opts).finally(() =>
		inflight.delete(key),
	);

	inflight.set(key, request);
	return request;
}

export async function fetchWithCache(
	url,
	{ token, ttl, force = false, api = true } = {},
) {
	const key = "req:" + url;
	const entry = getEntry(key);

	if (!force && isFresh(entry, ttl)) return entry.v;

	if (api) {
		const state = getRateLimitState();
		if (state.limited) {
			if (entry) return entry.v;
			throw new RateLimitError(state.resetAt);
		}
	}

	const headers = api ? authHeader(token) : {};
	if (entry?.etag) headers["If-None-Match"] = entry.etag;

	const r = await httpsGet(url, headers);
	if (api) noteRateLimit(r.headers);

	if (r.statusCode === 304 && entry) {
		touchEntry(key);
		return entry.v;
	}

	if (api && isRateLimitResponse(r)) {
		rateLimit.remaining = 0;
		if (entry) return entry.v;
		throw new RateLimitError(rateLimit.resetAt);
	}

	const raw = r.body.toString();
	let data = null;

	if (raw) {
		try {
			data = JSON.parse(raw);
		} catch {
			data = raw;
		}
	}

	const result = { status: r.statusCode, data };

	if (r.statusCode === 200 || r.statusCode === 404)
		setEntry(key, result, r.headers.etag);

	return result;
}
