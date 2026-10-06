import fs from "fs";
import path from "path";
import { injectList } from "../../injectList.js";
import { injectDir, isDev, resolveInjectPath } from "./paths.js";
import { ENCRYPTION_KEY } from "./env.js";
import { serializeInvocation } from "./runtime/serialize.js";
import { injectCssFile } from "./runtime/injectCssFile.js";
import { injectScopedCssText } from "./runtime/injectScopedCssText.js";
import { injectJsFile } from "./runtime/injectJsFile.js";
import { injectJsText } from "./runtime/injectJsText.js";

function readComposite(folder, parts) {
	return parts
		.map((part) => fs.readFileSync(path.join(injectDir, folder, part), "utf8"))
		.join("\n");
}

function buildItemFragment(item, config) {
	if (item.type === "js-composite" && isDev) {
		// Dev runs straight from src/, with no build step to compose the
		// parts - concatenate them at runtime and inject as inline text.
		const partsDir = path.join(injectDir, item.folder);

		if (!fs.existsSync(partsDir)) {
			console.warn("[Injector] ⚠️ Composite folder not found:", item.file);
			return null;
		}

		const code = readComposite(item.folder, item.parts);
		const injectScript = serializeInvocation(
			injectJsText,
			code,
			ENCRYPTION_KEY,
			item.file,
		);
		const label = `${item.file} (${item.parts.length} parts)`;

		return {
			label,
			code: `try{${injectScript}}catch(e){console.error(${JSON.stringify(`[Injector] inject error: ${label}`)},e);}`,
		};
	}

	const fullPath = resolveInjectPath(item.file);

	if (!fs.existsSync(fullPath)) {
		console.warn("[Injector] ⚠️ File not found:", item.file);
		return null;
	}

	const type =
		item.type === "js-composite"
			? "js"
			: (item.type ?? (item.file.endsWith(".css") ? "css" : "js"));

	let injectScript;
	let label = item.file;

	if (type === "css-scoped") {
		const rawCss = fs.readFileSync(fullPath, "utf8");
		const cssText = item.transform ? item.transform(rawCss, config) : rawCss;
		injectScript = serializeInvocation(
			injectScopedCssText,
			cssText,
			item.styleId,
		);
		label = `${item.styleId} (scoped)`;
	} else if (type === "css") {
		injectScript = serializeInvocation(injectCssFile, fullPath);
	} else if (type === "js") {
		injectScript = serializeInvocation(injectJsFile, fullPath, ENCRYPTION_KEY);
	} else {
		return null;
	}

	return {
		label,
		code: `try{${injectScript}}catch(e){console.error(${JSON.stringify(`[Injector] inject error: ${label}`)},e);}`,
	};
}

export function buildFragments(config, appVersion) {
	const fragments = [`window.__APP_VERSION__ = ${JSON.stringify(appVersion)};`];
	const injected = [];

	for (const item of injectList) {
		const { condition } = item;

		if (typeof condition === "function" && !condition(config)) {
			console.log("[Injector] Skipped by config:", item.file);
			continue;
		}

		const result = buildItemFragment(item, config);
		if (!result) continue;

		fragments.push(result.code);
		injected.push(result.label);
	}

	return { fragments, injected };
}
