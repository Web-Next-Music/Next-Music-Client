const ContainerId = {
	INFO: "INFO",
	ERROR: "ERROR",
	IMPORTANT: "IMPORTANT",
	FULLSCREEN_INFO: "FULLSCREEN_INFO",
	FULLSCREEN_ERROR: "FULLSCREEN_ERROR",
	AD_INFO: "AD_INFO",
};

const defaultToastOptions = {
	[ContainerId.INFO]: {
		autoClose: 2000,
		closeOnClick: false,
		pauseOnHover: true,
		draggable: false,
		single: true,
	},
	[ContainerId.ERROR]: {
		autoClose: 2000,
		closeOnClick: false,
		pauseOnHover: true,
		draggable: false,
		single: false,
	},
	[ContainerId.FULLSCREEN_INFO]: {
		autoClose: 2000,
		closeOnClick: false,
		pauseOnHover: true,
		draggable: false,
		single: true,
	},
	[ContainerId.FULLSCREEN_ERROR]: {
		autoClose: 2000,
		closeOnClick: false,
		pauseOnHover: true,
		draggable: false,
		single: true,
	},
	[ContainerId.IMPORTANT]: {
		closeOnClick: false,
		draggable: false,
		single: false,
		important: true,
	},
	[ContainerId.AD_INFO]: {
		autoClose: 2000,
		closeOnClick: false,
		pauseOnHover: true,
		draggable: false,
		single: true,
	},
};

function findMods(require) {
	const mods = require.m ?? {};
	let notificationMod = null;
	let reactMod = null;
	let componentsMod = null;
	let notificationCopyMod = null;

	for (const id of Object.keys(mods)) {
		try {
			const m = require(id);
			if (!m) continue;
			const keys = Object.keys(m);

			if (
				!notificationMod &&
				keys.length === 3 &&
				typeof m.Notification === "function" &&
				typeof m.notification === "function" &&
				typeof m.dismiss === "function"
			) {
				notificationMod = m;
			}

			if (
				!reactMod &&
				typeof m.createElement === "function" &&
				typeof m.Children === "object" &&
				keys.length === 40
			) {
				reactMod = m;
			}

			if (
				!componentsMod &&
				typeof m.$W === "function" &&
				typeof m.NX === "object" &&
				keys.length === 99
			) {
				componentsMod = m;
			}

			if (!notificationCopyMod && typeof m.NotificationCopy === "function") {
				notificationCopyMod = m;
			}

			if (notificationMod && reactMod && componentsMod && notificationCopyMod)
				break;
		} catch {}
	}

	return { notificationMod, reactMod, componentsMod, notificationCopyMod };
}

function notify(message, containerId, extra, cover) {
	containerId = containerId || ContainerId.INFO;
	extra = extra || {};

	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod, reactMod, componentsMod } = findMods(require);

			if (!notificationMod || !reactMod || !componentsMod) {
				console.warn("[nextmusicApi] toast modules not found");
				return;
			}

			const resolvedMessage =
				typeof message === "function" ? message(reactMod) : message;

			const toastEl = reactMod.createElement(componentsMod.$W, {
				message: resolvedMessage,
				...(cover
					? {
							cover: reactMod.createElement("img", {
								src: cover,
								width: 40,
								height: 40,
							}),
							coverRadius: "m",
						}
					: {}),
			});

			notificationMod.notification({
				message: toastEl,
				options: {
					...defaultToastOptions[containerId],
					containerId,
					...extra,
				},
			});
		},
	]);
}

function notifyCopy(entityTitle, entityVariant, containerId, extra) {
	containerId = containerId || ContainerId.INFO;
	extra = extra || {};

	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod, reactMod, notificationCopyMod } =
				findMods(require);

			if (!notificationMod || !reactMod || !notificationCopyMod) {
				console.warn("[nextmusicApi] notifyCopy modules not found");
				return;
			}

			const toastEl = reactMod.createElement(
				notificationCopyMod.NotificationCopy,
				{
					entityVariant: entityVariant || "track",
					entityTitle,
				},
			);

			notificationMod.notification({
				message: toastEl,
				options: {
					...defaultToastOptions[containerId],
					containerId,
					...extra,
				},
			});
		},
	]);
}

function notifyError(errorText, containerId, extra) {
	containerId = containerId || ContainerId.ERROR;
	extra = extra || {};

	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod, reactMod, componentsMod } = findMods(require);

			if (!notificationMod || !reactMod || !componentsMod) {
				console.warn("[nextmusicApi] notifyError modules not found");
				return;
			}

			const toastEl = reactMod.createElement(componentsMod.hT, {
				error: errorText,
			});

			notificationMod.notification({
				message: toastEl,
				options: {
					...defaultToastOptions[containerId],
					containerId,
					...extra,
				},
			});
		},
	]);
}

function dismissToast(notificationId) {
	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod } = findMods(require);
			if (!notificationMod) {
				console.warn("[nextmusicApi] notificationMod not found for dismiss");
				return;
			}
			notificationMod.dismiss({ notificationId, forceClose: true });
		},
	]);
}
