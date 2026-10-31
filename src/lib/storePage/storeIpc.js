import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { handleRequest } from "./requestHandler.js";
import {
	addonsDirectory,
	validAddonName,
	invalidateAddonsDir,
} from "./filesystem.js";
import { recoverTransactions } from "./transactions.js";
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

function validateSender(event) {
	const frame = event.senderFrame;
	if (
		!frame ||
		event.sender !== globalThis.mainWindow?.webContents ||
		frame !== event.sender.mainFrame
	)
		throw new Error("Invalid store sender");
	const url = new URL(frame.url);
	if (url.origin !== "https://music.yandex.ru")
		throw new Error("Invalid store sender");
}

function validatePayload(payload) {
	if (
		!payload ||
		typeof payload !== "object" ||
		Array.isArray(payload) ||
		!["GET", "POST"].includes(payload.method) ||
		typeof payload.urlPath !== "string" ||
		!/^\/api\/[a-z0-9/-]+$/i.test(payload.urlPath) ||
		!payload.qp ||
		typeof payload.qp !== "object" ||
		Array.isArray(payload.qp) ||
		Object.entries(payload.qp).some(
			([key, value]) =>
				key.length > 100 || typeof value !== "string" || value.length > 65536,
		) ||
		(payload.body !== null &&
			(typeof payload.body !== "string" || payload.body.length > 1024 * 1024))
	)
		throw new Error("Invalid store request");
}

export function setupStoreIpc() {
	recoverTransactions(addonsDirectory, validAddonName);
	invalidateAddonsDir();
	registerHandlers({
		[EDITOR_CHANNEL]: async (event) => {
			validateSender(event);
			const js = readCodeMirror(CM_JS);
			if (!js) throw new Error("CodeMirror assets not found");
			await event.sender.executeJavaScript(js + "\n;void 0;");
			return { css: readCodeMirror(CM_CSS) };
		},

		[CHANNEL]: async (event, payload) => {
			const {
				method = "GET",
				urlPath = "/",
				qp = {},
				body = null,
			} = payload || {};

			try {
				validateSender(event);
				validatePayload(payload);
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
