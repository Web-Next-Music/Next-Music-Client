import { defineConfig } from "vite";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import * as lightningcss from "lightningcss";
import {
	processDir,
	createElectronAssetsPlugin,
} from "./build/electronAssetsPlugin.js";
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
			const { join } = await import("path");
			const distRenderer = join("dist", "renderer");
			processDir(distRenderer, distRenderer, true);
		},
	};
}

export default defineConfig(({ command }) => ({
	base: "./",

	define: {
		__ENCRYPTION_KEY__: JSON.stringify(ENCRYPTION_KEY_VALUE),
		__APP_VERSION__: JSON.stringify(APP_VERSION),
	},

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
				settings: resolve(
					__dirname,
					"src/renderer/settings/index.html",
				),
				fallback: resolve(
					__dirname,
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
}));
