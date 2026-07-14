import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getPaths } from "../../config.js";

const CACHE_FILE = ".store-cache.json";
const LOGO_DIR = ".logo-cache";

let mem = null;
let saveTimer = null;

function cacheDir() {
	return getPaths().addonsDirectory;
}

function cachePath() {
	return path.join(cacheDir(), CACHE_FILE);
}

function load() {
	if (mem) return mem;

	try {
		const parsed = JSON.parse(fs.readFileSync(cachePath(), "utf8"));
		mem = parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		mem = {};
	}

	return mem;
}

function scheduleSave() {
	if (saveTimer) return;

	saveTimer = setTimeout(() => {
		saveTimer = null;
		try {
			fs.mkdirSync(cacheDir(), { recursive: true });
			fs.writeFileSync(cachePath(), JSON.stringify(mem), "utf8");
		} catch {}
	}, 500);

	if (saveTimer.unref) saveTimer.unref();
}

export function getEntry(key) {
	const entry = load()[key];
	return entry && typeof entry === "object" ? entry : null;
}

export function isFresh(entry, ttl) {
	return !!entry && typeof entry.t === "number" && Date.now() - entry.t < ttl;
}

export function setEntry(key, value, etag) {
	const data = load();
	data[key] = { v: value, t: Date.now() };
	if (etag) data[key].etag = etag;
	scheduleSave();
}

export function touchEntry(key) {
	const entry = getEntry(key);
	if (!entry) return;

	entry.t = Date.now();
	scheduleSave();
}

function logoPath(url) {
	const hash = crypto.createHash("sha1").update(url).digest("hex");
	return path.join(cacheDir(), LOGO_DIR, hash);
}

export function getLogo(url, ttl) {
	try {
		const file = logoPath(url);
		const stat = fs.statSync(file);
		if (Date.now() - stat.mtimeMs > ttl) return null;

		const meta = getEntry("logo:" + url);
		return {
			body: fs.readFileSync(file),
			contentType: meta?.v || "image/png",
		};
	} catch {
		return null;
	}
}

export function setLogo(url, body, contentType) {
	try {
		const file = logoPath(url);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, body);
		setEntry("logo:" + url, contentType || "image/png");
	} catch {}
}
