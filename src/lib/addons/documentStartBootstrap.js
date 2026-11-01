function runEarlyScripts(scripts) {
	if (window.__nmcEarlyAddonsExecuted) return;
	window.__nmcEarlyAddonsExecuted = true;
	for (const { label, content } of scripts) {
		try {
			(0, eval)(
				`(() => {\n${content}\n})()\n//# sourceURL=nmc-addon/${label.replace(/[\r\n]/g, "")}`,
			);
		} catch (err) {
			console.error(`[Addons] Early script failed for '${label}':`, err);
		}
	}
}

function buildDocumentStartScript(scripts) {
	return `(${runEarlyScripts.toString()})(${JSON.stringify(scripts)});`;
}

export { buildDocumentStartScript };
