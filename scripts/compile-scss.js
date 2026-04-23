import * as sass from "sass";
import fs from "fs";
import path from "path";

function walk(dir, out = []) {
	for (const file of fs.readdirSync(dir)) {
		const full = path.join(dir, file);
		if (fs.statSync(full).isDirectory()) {
			walk(full, out);
		} else if (path.extname(full) === ".scss") {
			out.push(full);
		}
	}
	return out;
}

const files = walk("src");

for (const file of files) {
	const result = sass.compile(file);
	const outFile = file.replace(/\.scss$/, ".css");
	fs.writeFileSync(outFile, result.css);
}
