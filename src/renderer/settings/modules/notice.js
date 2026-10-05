import { t } from "./i18n.js";
import pulsesyncIcon from "../../../assets/badges/pulsesync.svg";
import spotifastIcon from "../../../assets/badges/spotifast.svg";

const TIP_MARGIN = 8;
const TIP_GAP = 8;

function positionTip(wrap, tip) {
	const r = wrap.getBoundingClientRect();
	const tw = tip.offsetWidth;
	const th = tip.offsetHeight;

	let left = r.left + r.width / 2 - tw / 2;
	left = Math.min(
		Math.max(left, TIP_MARGIN),
		window.innerWidth - tw - TIP_MARGIN,
	);

	let top = r.top - th - TIP_GAP;
	if (top < TIP_MARGIN) top = r.bottom + TIP_GAP;

	tip.style.left = `${left}px`;
	tip.style.top = `${top}px`;
}

function buildCreditIcon({ icon, label, href, tooltipKey, tooltipFallback }) {
	const wrap = document.createElement("span");
	wrap.className = "credit-icon";
	wrap.tabIndex = 0;
	wrap.setAttribute("role", "button");
	wrap.setAttribute("aria-label", label);

	const img = document.createElement("img");
	img.src = icon;
	img.alt = "";
	wrap.append(img);

	const tip = document.createElement("span");
	tip.className = "credit-icon-tip";
	tip.textContent = t(tooltipKey, tooltipFallback);
	wrap.append(tip);

	const show = () => positionTip(wrap, tip);
	wrap.addEventListener("mouseenter", show);
	wrap.addEventListener("focus", show);

	const open = () => window.electronAPI?.openExternal?.(href);
	wrap.addEventListener("click", open);
	wrap.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			open();
		}
	});

	return wrap;
}

const SOURCES = {
	pulsesync: {
		icon: pulsesyncIcon,
		label: "PulseSync",
		href: "https://github.com/PulseSync-LLC/PulseSync-mod",
		tooltipKey: "settings.creditTooltip.pulsesync",
		tooltipFallback:
			"Part of this feature's code is borrowed from PulseSync. Click to open the project's source code.",
	},
	spotifast: {
		icon: spotifastIcon,
		label: "Spotifast",
		href: "https://github.com/crmne/spotifast",
		tooltipKey: "settings.creditTooltip.spotifast",
		tooltipFallback:
			"Part of this feature's code is borrowed from Spotifast. Click to open the project's source code.",
	},
};

export const GROUP_BADGE_KEY = (groupKey) => `group:${groupKey}`;

const BADGES = {
	[GROUP_BADGE_KEY("addons")]: "pulsesync",
	"programSettings.volumeNormalization": "pulsesync",
	"programSettings.alwaysExpandedPlayer": "pulsesync",
	"programSettings.visualizer": "spotifast",
};

export function getBadge(path) {
	const sourceKey = BADGES[path];
	return sourceKey ? buildCreditIcon(SOURCES[sourceKey]) : undefined;
}
