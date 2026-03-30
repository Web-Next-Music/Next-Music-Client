import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { minify } from "html-minifier-terser";
import { minify as terserMinify } from "terser";
import * as lightningcss from "lightningcss";

const SRC = "src";
const DIST = "dist";

const BROWSER_DIRS = [path.join(SRC, "lib", "storePage", "public")];

function isBrowserFile(file) {
    return BROWSER_DIRS.some((dir) => file.startsWith(dir));
}

function walk(dir, out = []) {
    for (const file of fs.readdirSync(dir)) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
            walk(full, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

async function build() {
    const files = walk(SRC);
    for (const file of files) {
        const outFile = file.replace(SRC, DIST);
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        const ext = path.extname(file);
        if (ext === ".js") {
            if (isBrowserFile(file)) {
                const code = fs.readFileSync(file, "utf8");
                const result = await terserMinify(code, {
                    ecma: 2020,
                    compress: true,
                    mangle: true,
                });
                fs.writeFileSync(outFile, result.code);
            } else {
                esbuild.buildSync({
                    entryPoints: [file],
                    outfile: outFile,
                    bundle: false,
                    platform: "node",
                    format: "esm",
                    minify: true,
                });
            }
        } else if (ext === ".cjs") {
            esbuild.buildSync({
                entryPoints: [file],
                outfile: outFile,
                bundle: false,
                platform: "node",
                format: "cjs",
                minify: true,
            });
        } else if (ext === ".css") {
            const css = fs.readFileSync(file);
            const result = lightningcss.transform({
                filename: file,
                code: css,
                minify: true,
            });
            fs.writeFileSync(outFile, result.code);
        } else if (ext === ".html") {
            const html = fs.readFileSync(file, "utf8");
            const minified = await minify(html, {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeEmptyAttributes: true,
                minifyCSS: true,
                minifyJS: false,
            });
            fs.writeFileSync(outFile, minified);
        } else {
            fs.copyFileSync(file, outFile);
        }
    }
}

build();
