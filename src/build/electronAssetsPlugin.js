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
import { API_FUNCTIONS_ORDER } from "../lib/api/order.js";

const SRC = "src";
const DIST = "dist";

const EXTRA_COPY_DIRS = ["src/data"];
const RENDERER_BASE = join(SRC, "renderer");
const STATIC_RENDERER_DIRS = ["info"];

const STALE_OUTPUTS = [
	join(DIST, "renderer", "info_v2", "loader", "script.cjs"),
];

export function walk(dir, out = []) {
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

export function minifyCSS(css, isProperties = false) {
	const placeholders = new Map();
	let counter = 0;
	let temp = css;
	temp = temp.replace(/\$\{[^}]+\}/g, (match) => {
		const key = `__PLACEHOLDER_${counter++}__`;
		placeholders.set(key, match);
		return key;
	});

	let minified;
	if (isProperties) {
		minified = temp
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\s+/g, " ")
			.replace(/\s*([{};:,])\s*/g, "$1")
			.replace(/;\s*$/g, ";")
			.trim();
	} else {
		const result = lightningcss.transform({
			code: Buffer.from(temp),
			minify: true,
		});
		minified = result.code.toString();
	}

	for (const [key, value] of placeholders) {
		minified = minified.replace(key, value);
	}
	return minified;
}

function minifyJS(file, outFile, encryptionKey, appVersion) {
	let code = readFileSync(file, "utf8");
	const isInjectFile = file.includes(join(SRC, "inject"));
	if (
		isInjectFile &&
		code.includes("const ENCRYPTION_KEY = __ENCRYPTION_KEY__")
	) {
		if (!encryptionKey) {
			console.warn(`⚠️  ENCRYPTION_KEY not found in .env for ${file}`);
		} else {
			console.log(`✓ Replacing __ENCRYPTION_KEY__ in ${basename(file)}`);
			code = code.replace(
				/const ENCRYPTION_KEY = __ENCRYPTION_KEY__;/g,
				`const ENCRYPTION_KEY = ${JSON.stringify(encryptionKey)};`,
			);
		}
	}
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

export function processDir(
	srcDir,
	distDir,
	allowHtml = false,
	encryptionKey = "",
	appVersion = "",
) {
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
			let code = readFileSync(file, "utf8");
			const isInjectFile = file.includes(join(SRC, "inject"));
			if (
				isInjectFile &&
				code.includes("const ENCRYPTION_KEY = __ENCRYPTION_KEY__")
			) {
				if (encryptionKey) {
					code = code.replace(
						/const ENCRYPTION_KEY = __ENCRYPTION_KEY__;/g,
						`const ENCRYPTION_KEY = ${JSON.stringify(encryptionKey)};`,
					);
				}
			}
			if (isInjectFile) {
				code = code.replace(
					/__APP_VERSION__/g,
					JSON.stringify(appVersion),
				);
			}

			const result = esbuild.transformSync(code, {
				minify: true,
				format: "esm",
				target: "es2022",
			});
			writeFileSync(
				outFile,
				result.code.replace(/\n/g, " ").trimEnd() + "\n",
			);
		} else if (ext === ".html" && allowHtml) {
			minifyHTML(file, outFile);
		} else {
			writeFileSync(outFile, readFileSync(file));
		}
	}
}

function bundleApiFiles() {
	const apiSrcDir = join(SRC, "lib", "api");
	const functionsDir = join(apiSrcDir, "functions");
	const mainFile = join(apiSrcDir, "main.js");

	if (!existsSync(functionsDir) || !existsSync(mainFile)) return;

	const parts = API_FUNCTIONS_ORDER.map((name) =>
		readFileSync(join(functionsDir, `${name}.js`), "utf-8"),
	);
	parts.push(readFileSync(mainFile, "utf-8"));

	const result = esbuild.transformSync(parts.join("\n"), {
		minify: true,
		target: "es2022",
	});

	const outDir = join(DIST, "lib", "api");
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, "bundle.js"), result.code);
	console.log("[build] API bundle written to", join(outDir, "bundle.js"));
}

export function createElectronAssetsPlugin(encryptionKey, appVersion) {
	return {
		name: "electron-build",
		async closeBundle() {
			for (const f of STALE_OUTPUTS) {
				if (existsSync(f)) rmSync(f);
			}

			processDir(
				join(SRC, "inject"),
				join(DIST, "inject"),
				false,
				encryptionKey,
				appVersion,
			);

			const lameAllSrc = readFileSync(
				join("node_modules", "lamejs", "lame.all.js"),
				"utf8",
			);
			const lameResult = esbuild.transformSync(lameAllSrc, {
				minify: true,
				format: "esm",
				target: "es2022",
			});
			writeFileSync(
				join(DIST, "inject", "lamejs.js"),
				lameResult.code.replace(/\n/g, " ").trimEnd() + "\n",
			);

			processDir(
				join(SRC, "lib"),
				join(DIST, "lib"),
				false,
				encryptionKey,
				appVersion,
			);
			bundleApiFiles();
			processDir(join(SRC, "assets"), join(DIST, "assets"));

			for (const dir of EXTRA_COPY_DIRS) {
				if (existsSync(dir)) {
					cpSync(dir, join(DIST, basename(dir)), { recursive: true });
				}
			}

			for (const file of ["config.js", "events.js", "index.js"]) {
				const src = join(SRC, file);
				const out = join(DIST, file);
				if (existsSync(src))
					minifyJS(src, out, encryptionKey, appVersion);
			}

			for (const dir of STATIC_RENDERER_DIRS) {
				processDir(
					join(RENDERER_BASE, dir),
					join(DIST, "renderer", dir),
					true,
					encryptionKey,
					appVersion,
				);
			}
		},
	};
}
