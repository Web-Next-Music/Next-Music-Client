import { defineConfig } from "vite";
import { builtinModules } from "module";
import {
	readdirSync,
	statSync,
	readFileSync,
	mkdirSync,
	copyFileSync,
	existsSync,
} from "fs";
import { resolve, join, extname, dirname } from "path";
import {
	processDir,
	createElectronAssetsPlugin,
} from "./src/build/electronAssetsPlugin.js";
import dotenv from "dotenv";

dotenv.config();
const env = process.env;

const APP_VERSION = `Next Music/${JSON.parse(readFileSync("package.json", "utf8")).version}`;

if (!env.ENCRYPTION_KEY) {
	try {
		const envFile = readFileSync(".env", "utf8");
		const match = envFile.match(/ENCRYPTION_KEY=([^\n\r]+)/);
		if (match) {
			env.ENCRYPTION_KEY = match[1].trim();
		}
	} catch (e) {
		console.warn("⚠️  Could not read .env file:", e.message);
	}
}

const ENCRYPTION_KEY_VALUE =
	env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "";
console.log(
	"Vite config: ENCRYPTION_KEY =",
	ENCRYPTION_KEY_VALUE ? "✓ loaded" : "✗ NOT FOUND",
);

const RENDERER_DIR = join("src", "renderer");
const BUILD_DIR = join("src", "build");

function replaceDefinesPlugin() {
	return {
		name: "replace-defines",
		resolveId(id) {
			if (id.startsWith("virtual:inject/")) {
				return id;
			}
		},
		load(id) {
			if (id.includes("src/inject/")) {
				const filePath = id.replace(/\?.*$/, "");
				if (existsSync(filePath)) {
					let code = readFileSync(filePath, "utf8");
					code = code.replace(
						/__ENCRYPTION_KEY__/g,
						JSON.stringify(ENCRYPTION_KEY_VALUE),
					);
					code = code.replace(
						/__APP_VERSION__/g,
						JSON.stringify(APP_VERSION),
					);
					return code;
				}
			}
		},
		transform(code, id) {
			if (
				id.includes("src/inject/") &&
				code.includes("__ENCRYPTION_KEY__")
			) {
				code = code.replace(
					/__ENCRYPTION_KEY__/g,
					JSON.stringify(ENCRYPTION_KEY_VALUE),
				);
				return { code };
			}
			if (
				id.includes("src/inject/") &&
				code.includes("__APP_VERSION__")
			) {
				code = code.replace(
					/__APP_VERSION__/g,
					JSON.stringify(APP_VERSION),
				);
				return { code };
			}
		},
	};
}

function minifyRendererDist() {
	return {
		name: "post-renderer-minify",
		async closeBundle() {
			const distRenderer = join("dist", "renderer");
			processDir(distRenderer, distRenderer, true);
		},
	};
}

function walk(dir, out = [], jsOnly = true) {
	for (const file of readdirSync(dir)) {
		const full = join(dir, file);
		if (statSync(full).isDirectory()) walk(full, out, jsOnly);
		else if (!jsOnly || extname(full) === ".js") out.push(full);
	}
	return out;
}

const CM_SRC = join("node_modules", "codemirror");
const CM_DEST = join("dist", "lib", "storePage", "cm");
const CM_FILES = [
	["lib/codemirror.css", "lib/codemirror.css"],
	["lib/codemirror.js", "lib/codemirror.js"],
	["addon/lint/lint.css", "addon/lint/lint.css"],
	["addon/fold/foldgutter.css", "addon/fold/foldgutter.css"],
	["mode/javascript/javascript.js", "mode/javascript/javascript.js"],
	["addon/edit/matchbrackets.js", "addon/edit/matchbrackets.js"],
	["addon/edit/closebrackets.js", "addon/edit/closebrackets.js"],
	["addon/selection/active-line.js", "addon/selection/active-line.js"],
	["addon/fold/foldcode.js", "addon/fold/foldcode.js"],
	["addon/fold/foldgutter.js", "addon/fold/foldgutter.js"],
	["addon/fold/brace-fold.js", "addon/fold/brace-fold.js"],
];

function copyListenAlongCallback() {
	return {
		name: "copy-listenalong-callback",
		closeBundle() {
			const files = [
				[
					join(
						"src",
						"lib",
						"listenAlong",
						"callback",
						"callback.html",
					),
					join(
						"dist",
						"lib",
						"listenAlong",
						"callback",
						"callback.html",
					),
				],
				[
					join(
						"src",
						"lib",
						"listenAlong",
						"callback",
						"callback.css",
					),
					join(
						"dist",
						"lib",
						"listenAlong",
						"callback",
						"callback.css",
					),
				],
				[
					join(
						"src",
						"assets",
						"listen-along",
						"callback",
						"bg.webp",
					),
					join(
						"dist",
						"assets",
						"listen-along",
						"callback",
						"bg.webp",
					),
				],
			];
			for (const [from, to] of files) {
				if (!existsSync(from)) continue;
				mkdirSync(dirname(to), { recursive: true });
				copyFileSync(from, to);
			}
		},
	};
}

function isMainEntry(file) {
	return !file.startsWith(RENDERER_DIR) && !file.startsWith(BUILD_DIR);
}

function copyCjsFiles() {
	return {
		name: "copy-cjs-files",
		closeBundle() {
			const cjsFiles = walk("src", [], false).filter(
				(f) => extname(f) === ".cjs" && isMainEntry(f),
			);
			for (const src of cjsFiles) {
				const dest = src.replace(/^src/, "dist");
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(src, dest);
			}
		},
	};
}

function copyCodeMirror() {
	return {
		name: "copy-codemirror",
		closeBundle() {
			for (const [from, to] of CM_FILES) {
				const dest = join(CM_DEST, to);
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(join(CM_SRC, from), dest);
			}
		},
	};
}

function copyStoreAssets() {
	return {
		name: "copy-store-assets",
		closeBundle() {
			const from = join("src", "lib", "storePage", "assets");
			const to = join("dist", "lib", "storePage", "assets");
			if (!existsSync(from)) return;
			mkdirSync(to, { recursive: true });
			for (const file of readdirSync(from)) {
				copyFileSync(join(from, file), join(to, file));
			}
		},
	};
}

function copyDefaultConfig() {
	return {
		name: "copy-default-config",
		closeBundle() {
			const from = join("src", "defaultConfig.lua");
			if (!existsSync(from)) return;
			mkdirSync("dist", { recursive: true });
			copyFileSync(from, join("dist", "defaultConfig.lua"));
		},
	};
}

function mainConfig() {
	const entries = walk("src").filter(isMainEntry);

	return {
		define: {
			__ENCRYPTION_KEY__: JSON.stringify(ENCRYPTION_KEY_VALUE),
			"process.env.ENCRYPTION_KEY": JSON.stringify(ENCRYPTION_KEY_VALUE),
		},

		plugins: [
			copyCjsFiles(),
			copyCodeMirror(),
			copyStoreAssets(),
			copyListenAlongCallback(),
			copyDefaultConfig(),
		],

		build: {
			outDir: "dist",
			emptyOutDir: false,
			minify: "esbuild",

			rollupOptions: {
				input: Object.fromEntries(
					entries.map((f) => [
						f.replace(/^src[\\/]/, "").replace(/\.js$/, ""),
						resolve(f),
					]),
				),

				external: (id) => {
					if (id === "electron") return true;
					if (builtinModules.includes(id)) return true;
					if (id.startsWith("node:")) return true;
					if (!id.startsWith(".") && !id.startsWith("/")) return true;
					return false;
				},

				output: {
					format: "es",
					preserveModules: true,
					preserveModulesRoot: "src",
					entryFileNames: "[name].js",
					dir: "dist",
				},
			},
		},
	};
}

function rendererConfig(command) {
	return {
		base: "./",

		define: {
			__ENCRYPTION_KEY__: JSON.stringify(ENCRYPTION_KEY_VALUE),
			__APP_VERSION__: JSON.stringify(APP_VERSION),
		},

		...(command === "build" && {
			root: resolve(import.meta.dirname, "src/renderer"),
		}),

		server: {
			port: 6788,
			strictPort: true,
		},

		build: {
			outDir: resolve(import.meta.dirname, "dist/renderer"),
			emptyOutDir: true,
			minify: "esbuild",
			rollupOptions: {
				input: {
					info_v2: resolve(
						import.meta.dirname,
						"src/renderer/info_v2/index.html",
					),
					loader: resolve(
						import.meta.dirname,
						"src/renderer/loader/index.html",
					),
					settings: resolve(
						import.meta.dirname,
						"src/renderer/settings/index.html",
					),
					fallback: resolve(
						import.meta.dirname,
						"src/renderer/fallback/fallback.html",
					),
				},
			},
		},

		plugins: [
			replaceDefinesPlugin(),
			command === "build" &&
				createElectronAssetsPlugin(ENCRYPTION_KEY_VALUE, APP_VERSION),
			command === "build" && minifyRendererDist(),
		].filter(Boolean),
	};
}

export default defineConfig(({ command, mode }) =>
	mode === "main" ? mainConfig() : rendererConfig(command),
);
