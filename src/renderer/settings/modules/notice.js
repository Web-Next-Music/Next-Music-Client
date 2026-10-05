import { t } from "./i18n.js";

export function buildNotice({
	titleKey,
	titleFallback,
	textKey,
	textFallback,
	links,
}) {
	const notice = document.createElement("div");
	notice.className = "pulsesync-notice";

	const strong = document.createElement("strong");
	strong.textContent = t(titleKey, titleFallback);
	notice.append(strong, document.createTextNode(" "));

	const template = t(textKey, textFallback);

	template.split(/(\{[a-z]+\})/g).forEach((part) => {
		const match = part.match(/^\{([a-z]+)\}$/);
		const link = match && links[match[1]];
		if (link) {
			const a = document.createElement("a");
			a.href = link.href;
			a.textContent = link.label;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			a.addEventListener("click", (e) => {
				e.preventDefault();
				window.electronAPI?.openExternal?.(link.href);
			});
			notice.append(a);
		} else if (part) {
			notice.append(document.createTextNode(part));
		}
	});

	return notice;
}

export function buildPulsesyncNotice() {
	return buildNotice({
		titleKey: "settings.pulsesyncNotice.title",
		titleFallback: "Important:",
		textKey: "settings.pulsesyncNotice.text",
		textFallback:
			"Some features are adapted from {client} to provide compatibility with themes and addons originally developed for {project}.",
		links: {
			client: {
				label: "PulseSync Client",
				href: "https://github.com/PulseSync-LLC/PulseSync-client",
			},
			project: {
				label: "PulseSync",
				href: "https://pulsesync.dev/",
			},
		},
	});
}

export function buildVolumeNormalizationNotice() {
	return buildNotice({
		titleKey: "settings.volumeNormalizationNotice.title",
		titleFallback: "Volume Normalization:",
		textKey: "settings.volumeNormalizationNotice.text",
		textFallback:
			"The normalization implementation is borrowed from {mod}.",
		links: {
			mod: {
				label: "PulseSync Mod",
				href: "https://github.com/PulseSync-LLC/PulseSync-mod",
			},
		},
	});
}

export function buildVisualizerNotice() {
	return buildNotice({
		titleKey: "settings.visualizerNotice.title",
		titleFallback: "Visualizer:",
		textKey: "settings.visualizerNotice.text",
		textFallback:
			"The spectrum visualizer implementation is borrowed from {mod}.",
		links: {
			mod: {
				label: "Spotifast",
				href: "https://github.com/crmne/spotifast",
			},
		},
	});
}

export const FIELD_NOTICES = {
	"alpha.volumeNormalization": buildVolumeNormalizationNotice,
	"programSettings.visualizer": buildVisualizerNotice,
};
