import { app } from "electron";
import { buildFragments } from "./buildFragments.js";
import { buildBootstrap } from "./bootstrap.js";

export function prepareEarlyInjector(config) {
	return buildBootstrap(
		buildFragments(config, `Next Music/${app.getVersion()}`),
	);
}

export default function injector(config, legacyConfig) {
	if (arguments.length > 1) return;
	return prepareEarlyInjector(config);
}
