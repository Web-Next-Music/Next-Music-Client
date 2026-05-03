import { defineConfig } from "vite";
import { resolve, join, extname, dirname, basename } from "path";
import {
	readdirSync,
	statSync,
	mkdirSync,
	cpSync,
	existsSync,
	rmSync,
	readFileSync,
	writeFileSync,
} from "fs";
import { minify as htmlMinify } from "html-minifier-terser";
import * as lightningcss from "lightningcss";
import * as sass from "sass";
import * as esbuild from "esbuild";

const SRC = "src";
const DIST = "dist";

const EXTRA_COPY_DIRS = ["data"];

const RENDERER_BASE = join(SRC, "renderer");
const STATIC_RENDERER_DIRS = ["fallback", "info"];

const STALE_OUTPUTS = [
	join(DIST, "renderer", "info_v2", "loader", "script.cjs"),
];

function walk(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const file of readdirSync(dir)) {
		const full = join(dir, file);
		if (statSync(full).isDirectory()) walk(full, out);
		else out.push(full);
	}
	return out;
}

function compileScss(srcFile, outFile) {
	const result = sass.compile(srcFile, { style: "compressed" });
	const minified = lightningcss.transform({
		filename: outFile,
		code: Buffer.from(result.css),
		minify: true,
	});
	writeFileSync(outFile.replace(/\.scss$/, ".css"), minified.code);
}

function minifyJS(file, outFile) {
	const code = readFileSync(file, "utf8");
	const result = esbuild.transformSync(code, {
		minify: true,
		format: "esm",
		target: "es2022",
	});
	writeFileSync(outFile, result.code);
}

function minifyHTML(file, outFile) {
	const html = readFileSync(file, "utf8");
	return htmlMinify(html, {
		collapseWhitespace: true,
		removeComments: true,
		removeRedundantAttributes: true,
		removeEmptyAttributes: true,
		minifyCSS: true,
		minifyJS: true,
	}).then((out) => writeFileSync(outFile, out));
}

function processDir(srcDir, distDir, allowHtml = false) {
	if (!existsSync(srcDir)) return;

	for (const file of walk(srcDir)) {
		const ext = extname(file);
		const outFile = file.replace(srcDir, distDir);
		mkdirSync(dirname(outFile), { recursive: true });

		if (ext === ".scss") {
			compileScss(file, outFile);
		} else if (ext === ".css") {
			const css = readFileSync(file);
			const result = lightningcss.transform({
				filename: file,
				code: css,
				minify: true,
			});
			writeFileSync(outFile, result.code);
		} else if (ext === ".js" || ext === ".cjs") {
			minifyJS(file, outFile);
		} else if (ext === ".html" && allowHtml) {
			minifyHTML(file, outFile);
		} else {
			writeFileSync(outFile, readFileSync(file));
		}
	}
}

function processElectronFiles() {
	return {
		name: "electron-build",
		async closeBundle() {
			for (const f of STALE_OUTPUTS) {
				if (existsSync(f)) rmSync(f);
			}

			processDir(join(SRC, "inject"), join(DIST, "inject"));
			processDir(join(SRC, "lib"), join(DIST, "lib"));
			processDir(join(SRC, "assets"), join(DIST, "assets"));

			for (const dir of EXTRA_COPY_DIRS) {
				if (existsSync(dir)) {
					cpSync(dir, join(DIST, basename(dir)), { recursive: true });
				}
			}

			for (const file of ["config.js", "events.js", "index.js"]) {
				const src = join(SRC, file);
				const out = join(DIST, file);
				if (existsSync(src)) minifyJS(src, out);
			}

			for (const dir of STATIC_RENDERER_DIRS) {
				processDir(join(RENDERER_BASE, dir), join(DIST, "renderer", dir), true);
			}
		},
	};
}

function minifyRendererDist() {
	return {
		name: "post-renderer-minify",
		async closeBundle() {
			const distRenderer = join(DIST, "renderer");
			processDir(distRenderer, distRenderer, true);
		},
	};
}

export default defineConfig(({ command }) => ({
	base: "./",

	...(command === "build" && {
		root: resolve(__dirname, "src/renderer"),
	}),

	server: {
		port: 6788,
		strictPort: true,
	},

	build: {
		outDir: resolve(__dirname, "dist/renderer"),
		emptyOutDir: true,
		minify: "esbuild",
		rollupOptions: {
			input: {
				info_v2: resolve(__dirname, "src/renderer/info_v2/index.html"),
				loader: resolve(__dirname, "src/renderer/loader/index.html"),
				settings: resolve(__dirname, "src/renderer/settings/index.html"),
			},
		},
	},

	plugins: [
		command === "build" && processElectronFiles(),
		command === "build" && minifyRendererDist(),
	].filter(Boolean),
}));
