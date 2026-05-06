import { defineConfig } from "vite";
import { resolve } from "path";
import { builtinModules } from "module";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, extname } from "path";
import dotenv from "dotenv";

dotenv.config();
const env = process.env;

if (!env.ENCRYPTION_KEY) {
	try {
		const envFile = readFileSync(".env", "utf8");
		const match = envFile.match(/ENCRYPTION_KEY=(.+)/);
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

// Все JS файлы из src/ кроме renderer/
const entries = walk("src").filter(
	(f) => !f.startsWith(join("src", "renderer")),
);

export default defineConfig({
	define: {
		__ENCRYPTION_KEY__: JSON.stringify(ENCRYPTION_KEY_VALUE),
	},

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
