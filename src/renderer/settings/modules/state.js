export const state = {
	CONFIG: {},
	ORIGINAL_CONFIG: {},
	STRINGS: {},
	LANGLIST: [],
	ADDON_EXPERIMENTS: [],
	BUILTIN_EXPERIMENTS: {},
	hasPendingChanges: false,
	restartRequired: false,
	saving: false,
	languageSaving: 0,
	toastTimer: null,
	activeTab: null,
	HAS_STARRED: false,
	TOKEN_EXPIRED: false,
};

export const STAR_GATED_PATHS = [
	"programSettings.richPresence.rpcTitle",
	"programSettings.richPresence.largeImageUrl",
	"programSettings.richPresence.buttons.githubButton",
];
