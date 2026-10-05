import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const isDev = __dirname.includes(path.sep + "src" + path.sep);

export const injectDir = isDev
	? path.resolve(__dirname, "../../../src/inject")
	: path.join(__dirname, "../../inject");

const lamejsDevPath = path.resolve(
	__dirname,
	"../../../node_modules/lamejs/lame.all.js",
);

export function resolveInjectPath(file) {
	if (isDev && file === "lamejs.js" && fs.existsSync(lamejsDevPath)) {
		return lamejsDevPath.replace(/\\/g, "/");
	}
	return path.join(injectDir, file).replace(/\\/g, "/");
}
