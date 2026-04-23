import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev (__dirname = src/lib):  resolve ../../dist/renderer → dist/renderer
// Prod (__dirname = dist/lib): join ../renderer          → dist/renderer
const isDev = __dirname.includes(path.sep + "src" + path.sep);
export const rendererRoot = isDev
	? path.resolve(__dirname, "../../dist/renderer")
	: path.join(__dirname, "../renderer");
