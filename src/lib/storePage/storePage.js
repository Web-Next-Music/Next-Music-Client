import path from "path";
import { fileURLToPath } from "url";
import { BrowserWindow, protocol } from "electron";

import { handleRequest } from "./requestHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, "public");

export function setupStorePage() {
	protocol.handle("nextstore", async (request) => {
		const url = new URL(request.url);
		const urlPath = url.pathname;
		const qp = Object.fromEntries(url.searchParams);
		const method = request.method;

		const getBody = () =>
			request.arrayBuffer().then((ab) => Buffer.from(ab).toString("utf8"));

		let senderWcId = null;

		try {
			const allWins = BrowserWindow.getAllWindows();
			for (const w of allWins) {
				if (w.webContents.getURL().startsWith("nextstore://")) {
					senderWcId = w.webContents.id;
					break;
				}
			}
		} catch {}

		try {
			const result = await handleRequest(
				method,
				urlPath,
				qp,
				getBody,
				PUBLIC_DIR,
				senderWcId,
			);

			return new Response(result.body, {
				status: result.status,
				headers: result.headers,
			});
		} catch (e) {
			return new Response(JSON.stringify({ error: e.message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}
	});
}
