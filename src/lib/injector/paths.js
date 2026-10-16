import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const isDev = __dirname.includes(path.sep + "src" + path.sep);

export const injectDir = isDev
	? path.resolve(__dirname, "../../../src/inject")
	: path.join(__dirname, "../../inject");

export function resolveInjectPath(file) {
	return path.join(injectDir, file).replace(/\\/g, "/");
}
