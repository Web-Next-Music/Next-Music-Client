export function buildBootstrap({
	fragments,
	styles = [],
	scripts = [],
	apiScripts = [],
}) {
	const early = fragments.slice(0, 2).join("\n");
	const deferred = [...fragments.slice(2), ...styles].join("\n");

	return `(() => {
		if (window.top !== window || location.protocol !== "https:" ||
			(location.hostname !== "music.yandex.ru" &&
			!location.hostname.endsWith(".music.yandex.ru"))) return;
		const marker = Symbol.for("nextmusic.injector.started");
		if (window[marker]) return;
		window[marker] = true;
		${early}
		const start = async () => {
			${deferred}
			const runScripts = async () => {
				${scripts.join("\n")}

			};
			if (document.readyState === "complete") void runScripts();
			else window.addEventListener("load", () => void runScripts(), { once: true });
			${
				apiScripts.length
					? `
			const runApiScripts = async () => {
				if (!window.nextmusicApi) {
					setTimeout(runApiScripts, 250);
					return;
				}
				${apiScripts.join("\n")}
			};
			void runApiScripts();`
					: ""
			}
		};
		if (document.head) {
			void start();
		} else {
			const observer = new MutationObserver(() => {
				if (!document.head) return;
				observer.disconnect();
				void start();
			});
			observer.observe(document, { childList: true, subtree: true });
		}
	})()`;
}
