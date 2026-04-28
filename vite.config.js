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

const SRC = "src";
const DIST = "dist";
const EXTRA_COPY_DIRS = ["data"];
const STALE_OUTPUTS = [
	join(DIST, "renderer", "info_v2", "loader", "script.cjs"),
];

const RENDERER_BASE = join(SRC, "renderer");

const STATIC_RENDERER_DIRS = ["fallback", "info"];

// Папки src которые идут в node/electron контекст (не browser)
const BROWSER_DIRS = [
	join(SRC, "lib", "storePage", "public"),
	join(SRC, "inject"),
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

function processElectronFiles() {
	return {
		name: "electron-build",
		async closeBundle() {
			console.log(
				"\n[electron-build] Processing electron + static renderer files...",
			);

			for (const f of STALE_OUTPUTS) {
				if (existsSync(f)) rmSync(f);
			}

			// === 1. Обрабатываем inject/ ===
			const injectSrc = join(SRC, "inject");
			const injectDist = join(DIST, "inject");
			for (const file of walk(injectSrc)) {
				const ext = extname(file);
				const outFile = file.replace(injectSrc, injectDist);
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
				} else {
					writeFileSync(outFile, readFileSync(file));
				}
			}

			// === 2. Static renderer окна (fallback, info) ===
			for (const dirName of STATIC_RENDERER_DIRS) {
				const srcDir = join(RENDERER_BASE, dirName);
				const distDir = join(DIST, "renderer", dirName);
				if (!existsSync(srcDir)) {
					console.warn(`[electron-build] ${srcDir} not found, skipping...`);
					continue;
				}

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
					} else if (ext === ".html") {
						const html = readFileSync(file, "utf8");
						const minified = await htmlMinify(html, {
							collapseWhitespace: true,
							removeComments: true,
							removeRedundantAttributes: true,
							removeEmptyAttributes: true,
							minifyCSS: true,
							minifyJS: true,
						});
						writeFileSync(outFile, minified);
					} else if (ext === ".cjs") {
						writeFileSync(outFile, readFileSync(file));
					} else {
						writeFileSync(outFile, readFileSync(file));
					}
				}
			}

			// === 3. Electron main process файлы (src/lib) ===
			const libDir = join(SRC, "lib");
			for (const file of walk(libDir)) {
				const outFile = file.replace(SRC, DIST);
				mkdirSync(dirname(outFile), { recursive: true });

				const ext = extname(file);
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
				} else {
					writeFileSync(outFile, readFileSync(file));
				}
			}

			// === 4. Assets ===
			const assetsDir = join(SRC, "assets");
			if (existsSync(assetsDir)) {
				for (const file of walk(assetsDir)) {
					const outFile = file.replace(SRC, DIST);
					mkdirSync(dirname(outFile), { recursive: true });
					writeFileSync(outFile, readFileSync(file));
				}
			}

			// === 5. Копируем data/ ===
			for (const dir of EXTRA_COPY_DIRS) {
				if (!existsSync(dir)) continue;
				cpSync(dir, join(DIST, basename(dir)), { recursive: true });
			}

			// === 6. Корневые файлы ===
			const rootFiles = ["config.js", "events.js", "index.js"];
			for (const file of rootFiles) {
				const src = join(SRC, file);
				const out = join(DIST, file);
				if (existsSync(src)) {
					mkdirSync(dirname(out), { recursive: true });
					writeFileSync(out, readFileSync(src));
				}
			}

			console.log("[electron-build] Done!\n");
		},
	};
}

export default defineConfig(({ command }) => ({
	base: "./",

	...(command === "build" && {
		root: resolve(__dirname, "src/renderer"),
	}),

	server: {
		port: 5173,
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

	plugins: [command === "build" && processElectronFiles()].filter(Boolean),
}));
