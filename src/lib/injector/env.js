import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ENCRYPTION_KEY =
	process.env.ENCRYPTION_KEY ||
	(() => {
		try {
			const envPath = path.resolve(__dirname, "../../../.env");
			const envContent = fs.readFileSync(envPath, "utf8");
			const match = envContent.match(/ENCRYPTION_KEY=([^\n\r]+)/);
			return match ? match[1].trim() : "";
		} catch {
			return "";
		}
	})();
