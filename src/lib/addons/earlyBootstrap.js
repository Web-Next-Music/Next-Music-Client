function bootstrap(data) {
	const applyCss = (items) => {
		for (const { label, content } of items) {
			try {
				let style = [
					...document.querySelectorAll("style[data-nmc-addon-css]"),
				].find((node) => node.dataset.nmcAddonCss === label);
				if (style) continue;
				style = document.createElement("style");
				style.dataset.nmcAddonCss = label;
				style.textContent = content;
				(document.head || document.documentElement).appendChild(style);
			} catch (err) {
				console.error(`[Addons] CSS failed for '${label}':`, err);
			}
		}
	};
	const runScripts = (items) => {
		for (const { label, content } of items) {
			try {
				(0, eval)(
					`(() => {\n${content}\n})()\n//# sourceURL=nmc-addon/${label.replace(/[\r\n]/g, "")}`,
				);
			} catch (err) {
				console.error(`[Addons] Script failed for '${label}':`, err);
			}
		}
	};
	const pendingCss = new Map(
		data.experimentCss.map(({ label, content }) => [label, content]),
	);
	window.__nmcPendingAddonCss = pendingCss;
	applyCss(data.regularCss);
	let experimentsDone =
		!data.waitForExperiments || !!window.__nmcExperimentsDone;
	let scriptsStarted = false;
	let done = false;
	const startScripts = () => {
		if (
			scriptsStarted ||
			!document.head ||
			!document.body ||
			!window.nextmusicApi
		)
			return;
		scriptsStarted = true;
		clearInterval(readyTimer);
		runScripts(data.regularJs);
		if (experimentsDone) finish();
	};
	const readyTimer = setInterval(startScripts, 50);
	let timer;
	const finish = () => {
		experimentsDone = true;
		if (done || !scriptsStarted) return;
		done = true;
		clearTimeout(timer);
		window.removeEventListener("__nmcExperimentsApplied", finish);
		applyCss(
			[...pendingCss]
				.filter(([, content]) => content !== null)
				.map(([label, content]) => ({ label, content })),
		);
		delete window.__nmcPendingAddonCss;
		runScripts(data.experimentJs);
		for (const { label, content } of data.onlineCss) {
			try {
				let style = [
					...document.querySelectorAll("style[data-nmc-online-addon-css]"),
				].find((node) => node.dataset.nmcOnlineAddonCss === label);
				if (!style) {
					style = document.createElement("style");
					style.dataset.nmcOnlineAddonCss = label;
					(document.head || document.documentElement).appendChild(style);
				}
				style.textContent = content;
			} catch (err) {
				console.error(`[Addons] CSS failed for '${label}':`, err);
			}
		}
		runScripts(data.onlineJs);
	};
	if (!data.waitForExperiments || window.__nmcExperimentsDone) finish();
	else {
		window.addEventListener("__nmcExperimentsApplied", finish, {
			once: true,
		});
		timer = setTimeout(() => {
			console.warn(
				"[Addons] Experiments wait timed out, loading experiment addons anyway",
			);
			finish();
		}, 20000);
		if (window.__nmcExperimentsDone) finish();
	}
	startScripts();
}

function buildEarlyAddonsScript(snapshot) {
	return `(${bootstrap.toString()})(${JSON.stringify(snapshot)});`;
}

export { buildEarlyAddonsScript };
