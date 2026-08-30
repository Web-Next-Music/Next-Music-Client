import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { handleRequest } from "./requestHandler.js";
import { registerHandlers } from "../ipc/registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANNEL = "nmc:store-request";
const EDITOR_CHANNEL = "nmc:store-load-editor";

const CM_JS = [
	"lib/codemirror.js",
	"mode/javascript/javascript.js",
	"addon/edit/matchbrackets.js",
	"addon/edit/closebrackets.js",
	"addon/selection/active-line.js",
	"addon/fold/foldcode.js",
	"addon/fold/foldgutter.js",
	"addon/fold/brace-fold.js",
];

const CM_CSS = [
	"lib/codemirror.css",
	"addon/fold/foldgutter.css",
	"addon/lint/lint.css",
];

function codeMirrorDir() {
	const bundled = path.join(__dirname, "cm");
	if (fs.existsSync(bundled)) return bundled;
	return path.join(process.cwd(), "node_modules", "codemirror");
}

function readCodeMirror(files) {
	const dir = codeMirrorDir();
	const parts = [];
	for (const file of files) {
		const full = path.join(dir, file);
		if (fs.existsSync(full)) parts.push(fs.readFileSync(full, "utf8"));
	}
	return parts.join("\n");
}

const TEXT_TYPES = ["json", "text/", "javascript", "css", "xml", "svg"];

function isTextual(contentType) {
	const ct = String(contentType || "").toLowerCase();
	return TEXT_TYPES.some((t) => ct.includes(t));
}

export function setupStoreIpc() {
	registerHandlers({
		[EDITOR_CHANNEL]: async (event) => {
			const js = readCodeMirror(CM_JS);
			if (!js) throw new Error("CodeMirror assets not found");
			await event.sender.executeJavaScript(js + "\n;void 0;");
			return { css: readCodeMirror(CM_CSS) };
		},

		[CHANNEL]: async (_event, payload) => {
			const {
				method = "GET",
				urlPath = "/",
				qp = {},
				body = null,
			} = payload || {};

			try {
				const result = await handleRequest(
					method,
					urlPath,
					qp,
					async () => body ?? "",
				);

				const headers = result.headers || {};
				const contentType =
					headers["Content-Type"] || headers["content-type"] || "";

				return {
					status: result.status,
					headers,
					body: isTextual(contentType)
						? result.body.toString("utf8")
						: new Uint8Array(result.body),
				};
			} catch (e) {
				return {
					status: 500,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ error: e.message }),
				};
			}
		},
	});
}
