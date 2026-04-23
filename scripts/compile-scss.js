import * as sass from "sass";
import fs from "fs";
import path from "path";

const SRC_RENDERER = path.join("src", "renderer");
const DIST_RENDERER = path.join("dist", "renderer");
const SRC_INJECT = path.join("src", "inject");
const DIST_INJECT = path.join("dist", "inject");
const SRC_ASSETS = path.join("src", "assets");
const DIST_ASSETS = path.join("dist", "assets");

function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (fs.statSync(full).isDirectory()) {
			walk(full, out);
		} else {
			out.push(full);
		}
	}
	return out;
}

// Renderer: SCSS → dist/renderer/ as CSS, everything else → copy as-is
for (const file of walk(SRC_RENDERER)) {
	const ext = path.extname(file);
	const rel = path.relative(SRC_RENDERER, file);
	const outFile = path.join(DIST_RENDERER, rel);

	fs.mkdirSync(path.dirname(outFile), { recursive: true });

	if (ext === ".scss") {
		const result = sass.compile(file);
		fs.writeFileSync(outFile.replace(/\.scss$/, ".css"), result.css);
	} else {
		fs.copyFileSync(file, outFile);
	}
}

// Assets: copy as-is to dist/assets/
for (const file of walk(SRC_ASSETS)) {
	const rel = path.relative(SRC_ASSETS, file);
	const outFile = path.join(DIST_ASSETS, rel);
	fs.mkdirSync(path.dirname(outFile), { recursive: true });
	fs.copyFileSync(file, outFile);
}

// Inject: SCSS → dist/inject/ as CSS, everything else → copy as-is
fs.mkdirSync(DIST_INJECT, { recursive: true });

for (const entry of fs.readdirSync(SRC_INJECT)) {
	const full = path.join(SRC_INJECT, entry);
	const ext = path.extname(entry);
	const outFile = path.join(DIST_INJECT, entry);

	if (ext === ".scss") {
		const result = sass.compile(full);
		fs.writeFileSync(outFile.replace(/\.scss$/, ".css"), result.css);
	} else {
		fs.copyFileSync(full, outFile);
	}
}
