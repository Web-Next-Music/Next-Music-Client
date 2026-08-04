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

function isNotifyFn(fn) {
	if (typeof fn !== "function") return false;
	const src = fnBody(fn);
	const keys = firstDestructureKeys(src);
	return (
		/\bmessage\b/.test(keys) &&
		/\boptions\b/.test(keys) &&
		/toast/.test(src)
	);
}

function isDismissFn(fn) {
	if (typeof fn !== "function") return false;
	const keys = firstDestructureKeys(fnBody(fn));
	return /\bnotificationId\b/.test(keys) && /\bforceClose\b/.test(keys);
}

function isToastMessageComponent(fn) {
	if (typeof fn !== "function") return false;
	const keys = firstDestructureKeys(fnBody(fn));
	return (
		/\bmessage\b/.test(keys) &&
		/\bcover\b/.test(keys) &&
		/\bcoverRadius\b/.test(keys)
	);
}

function isErrorToastComponent(fn) {
	if (typeof fn !== "function") return false;
	const keys = firstDestructureKeys(fnBody(fn));
	return /\berror\b/.test(keys) && /\bcloseToast\b/.test(keys);
}

function isNotificationCopyComponent(fn) {
	if (typeof fn !== "function") return false;
	const keys = firstDestructureKeys(fnBody(fn));
	return (
		/\bentityVariant\b/.test(keys) &&
		/\bentityTitle\b/.test(keys) &&
		/\bcloseToast\b/.test(keys) &&
		!/\bisPinned\b/.test(keys) &&
		!/\bcustomCover\b/.test(keys)
	);
}

function findMods(require) {
	const mods = require.m ?? {};
	let notificationMod = null;
	let reactMod = null;
	let toastMessageComponent = null;
	let errorToastComponent = null;
	let notificationCopyComponent = null;

	for (const id of Object.keys(mods)) {
		try {
			const m = require(id);
			if (!m) continue;

			if (!reactMod && isReactMod(m)) {
				reactMod = m;
			}

			if (!notificationMod) {
				let notifyFn = null;
				let dismissFn = null;
				for (const k of Object.keys(m)) {
					if (!notifyFn && isNotifyFn(m[k])) notifyFn = m[k];
					if (!dismissFn && isDismissFn(m[k])) dismissFn = m[k];
				}
				if (notifyFn && dismissFn) {
					notificationMod = {
						notification: notifyFn,
						dismiss: dismissFn,
					};
				}
			}

			for (const k of Object.keys(m)) {
				const fn = m[k];
				if (!toastMessageComponent && isToastMessageComponent(fn)) {
					toastMessageComponent = fn;
				}
				if (!errorToastComponent && isErrorToastComponent(fn)) {
					errorToastComponent = fn;
				}
				if (
					!notificationCopyComponent &&
					isNotificationCopyComponent(fn)
				) {
					notificationCopyComponent = fn;
				}
			}

			if (
				notificationMod &&
				reactMod &&
				toastMessageComponent &&
				errorToastComponent &&
				notificationCopyComponent
			)
				break;
		} catch {}
	}

	return {
		notificationMod,
		reactMod,
		toastMessageComponent,
		errorToastComponent,
		notificationCopyComponent,
	};
}

function notify(message, containerId, extra, cover) {
	containerId = containerId || ContainerId.INFO;
	extra = extra || {};

	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod, reactMod, toastMessageComponent } =
				findMods(require);

			if (!notificationMod || !reactMod || !toastMessageComponent) {
				console.warn("[nextmusicApi] toast modules not found");
				return;
			}

			const resolvedMessage =
				typeof message === "function" ? message(reactMod) : message;

			const toastEl = reactMod.createElement(toastMessageComponent, {
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
			const { notificationMod, reactMod, notificationCopyComponent } =
				findMods(require);

			if (!notificationMod || !reactMod || !notificationCopyComponent) {
				console.warn("[nextmusicApi] notifyCopy modules not found");
				return;
			}

			const toastEl = reactMod.createElement(notificationCopyComponent, {
				entityVariant: entityVariant || "track",
				entityTitle,
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

function notifyError(errorText, containerId, extra) {
	containerId = containerId || ContainerId.ERROR;
	extra = extra || {};

	window.webpackChunk_N_E.push([
		[Math.random()],
		{},
		(require) => {
			const { notificationMod, reactMod, errorToastComponent } =
				findMods(require);

			if (!notificationMod || !reactMod || !errorToastComponent) {
				console.warn("[nextmusicApi] notifyError modules not found");
				return;
			}

			const toastEl = reactMod.createElement(errorToastComponent, {
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
				console.warn(
					"[nextmusicApi] notificationMod not found for dismiss",
				);
				return;
			}
			notificationMod.dismiss({ notificationId, forceClose: true });
		},
	]);
}
