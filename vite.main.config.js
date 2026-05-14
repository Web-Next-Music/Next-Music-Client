import { defineConfig } from "vite";
import { resolve } from "path";
import { builtinModules } from "module";
import {
	readdirSync,
	statSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	copyFileSync,
} from "fs";
import { join, extname, dirname } from "path";
import dotenv from "dotenv";

dotenv.config();
const env = process.env;

if (!env.ENCRYPTION_KEY) {
	try {
		const envFile = readFileSync(".env", "utf8");
		const match = envFile.match(/ENCRYPTION_KEY=([^\n\r]+)/);
		if (match) {
			env.ENCRYPTION_KEY = match[1].trim();
		}
	} catch (e) {}
}

const ENCRYPTION_KEY_VALUE =
	env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "";

function walk(dir, out = []) {
	for (const file of readdirSync(dir)) {
		const full = join(dir, file);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (extname(full) === ".js") out.push(full);
	}
	return out;
}

const STORE_PUBLIC = join("src", "lib", "storePage", "public");

// All JS files from src/ except renderer/ and storePage/public/ (they are copied as-is)
const entries = walk("src").filter(
	(f) => !f.startsWith(join("src", "renderer")) && !f.startsWith(STORE_PUBLIC),
);

function walkAll(dir, out = []) {
	for (const file of readdirSync(dir)) {
		const full = join(dir, file);
		if (statSync(full).isDirectory()) walkAll(full, out);
		else out.push(full);
	}
	return out;
}

const CM_SRC = join("node_modules", "codemirror");
const CM_DEST = join("dist", "lib", "storePage", "public", "cm");
const CM_FILES = [
	["lib/codemirror.css",                    "codemirror.css"],
	["lib/codemirror.js",                     "codemirror.js"],
	["addon/lint/lint.css",                   "addon/lint/lint.css"],
	["addon/fold/foldgutter.css",             "addon/fold/foldgutter.css"],
	["mode/javascript/javascript.js",         "mode/javascript/javascript.js"],
	["addon/edit/matchbrackets.js",           "addon/edit/matchbrackets.js"],
	["addon/edit/closebrackets.js",           "addon/edit/closebrackets.js"],
	["addon/selection/active-line.js",        "addon/selection/active-line.js"],
	["addon/fold/foldcode.js",                "addon/fold/foldcode.js"],
	["addon/fold/foldgutter.js",              "addon/fold/foldgutter.js"],
	["addon/fold/brace-fold.js",              "addon/fold/brace-fold.js"],
];

function copyStorePublic() {
	return {
		name: "copy-store-public",
		closeBundle() {
			const files = walkAll(STORE_PUBLIC);
			for (const src of files) {
				const dest = src.replace(
					join("src", "lib", "storePage", "public"),
					join("dist", "lib", "storePage", "public"),
				);
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(src, dest);
			}

			for (const [from, to] of CM_FILES) {
				const dest = join(CM_DEST, to);
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(join(CM_SRC, from), dest);
			}
		},
	};
}

const STORE_PUBLIC_DIST = join("dist", "lib", "storePage", "public");

function processOutputFiles() {
	return {
		name: "process-output-files",
		async closeBundle() {
			const distFiles = walk("dist").filter(
				(f) => extname(f) === ".js" && !f.startsWith(STORE_PUBLIC_DIST),
			);
			for (const file of distFiles) {
				let code = readFileSync(file, "utf8");
				let output = code.replace(/\n/g, " ").trimEnd() + "\n";
				if (output !== code) {
					writeFileSync(file, output);
				}
			}
		},
	};
}

export default defineConfig({
	define: {
		__ENCRYPTION_KEY__: JSON.stringify(ENCRYPTION_KEY_VALUE),
		"process.env.ENCRYPTION_KEY": JSON.stringify(ENCRYPTION_KEY_VALUE),
	},

	plugins: [copyStorePublic(), processOutputFiles()],

	build: {
		outDir: "dist",
		emptyOutDir: false,
		minify: "esbuild",

		rollupOptions: {
			input: Object.fromEntries(
				entries.map((f) => [
					// ключ = путь без src/ и без .js → используется как имя выходного файла
					f.replace(/^src[\\/]/, "").replace(/\.js$/, ""),
					resolve(f),
				]),
			),

			external: (id) => {
				if (id === "electron") return true;
				if (builtinModules.includes(id)) return true;
				if (id.startsWith("node:")) return true;
				// всё что не относительный путь — внешнее (node_modules)
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
});
