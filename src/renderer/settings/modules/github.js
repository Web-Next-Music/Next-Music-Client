import { state } from "./state.js";
import { t } from "./i18n.js";

export function buildGitHubStarBlock(onRefresh) {
	const hasStarred = state.HAS_STARRED;
	const hasToken = !!state.CONFIG?.github?.accessToken && !state.TOKEN_EXPIRED;

	const wrap = document.createElement("div");
	wrap.className = "gh-star-block";

	const header = document.createElement("div");
	header.className = "gh-star-header";

	const icon = document.createElement("span");
	icon.className = "gh-star-icon";
	icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

	const title = document.createElement("span");
	title.className = "gh-star-title";
	title.textContent = t("settings.github.title");

	const badge = document.createElement("span");
	badge.className = "gh-star-badge" + (hasStarred ? " gh-star-badge--ok" : "");
	badge.textContent = hasStarred
		? t("settings.github.starred")
		: t("settings.github.notStarred");

	header.append(icon, title, badge);
	wrap.append(header);

	const desc = document.createElement("div");
	desc.className = "gh-star-desc";
	desc.textContent = t("settings.github.desc");
	wrap.append(desc);

	const deviceArea = document.createElement("div");
	deviceArea.className = "gh-device-area";
	deviceArea.hidden = true;

	const deviceInstr = document.createElement("div");
	deviceInstr.className = "gh-device-instr";
	deviceInstr.textContent = t("settings.github.deviceInstr");
	const deviceCode = document.createElement("div");
	deviceCode.className = "gh-device-code";
	const deviceTimer = document.createElement("div");
	deviceTimer.className = "gh-device-timer";

	deviceCode.addEventListener("click", () => {
		const code = deviceCode.textContent.trim();
		if (!code || code === "…") return;
		navigator.clipboard.writeText(code).catch(() => {});
		deviceCode.classList.remove("gh-device-code--copied");
		void deviceCode.offsetWidth;
		deviceCode.classList.add("gh-device-code--copied");
	});

	deviceCode.addEventListener("animationend", () => {
		deviceCode.classList.remove("gh-device-code--copied");
	});

	deviceArea.append(deviceInstr, deviceCode, deviceTimer);
	wrap.append(deviceArea);

	const errLine = document.createElement("div");
	errLine.className = "gh-star-error";
	errLine.hidden = !state.TOKEN_EXPIRED;
	if (state.TOKEN_EXPIRED)
		errLine.textContent = t("settings.github.tokenExpired");
	wrap.append(errLine);

	const actRow = document.createElement("div");
	actRow.className = "gh-star-actions";

	async function doConnect() {
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
		deviceArea.hidden = true;
		errLine.hidden = true;
		deviceCode.textContent = "…";
		deviceTimer.textContent = "";

		const unsubCode = window.electronAPI?.onGitHubDeviceCode?.((info) => {
			deviceArea.hidden = false;
			deviceCode.textContent = info.userCode;
			deviceTimer.textContent = `${info.expiresIn}s`;
		});
		const unsubProgress = window.electronAPI?.onGitHubDeviceProgress?.(
			(secondsLeft) => {
				deviceTimer.textContent = `${secondsLeft}s`;
			},
		);

		const result = await window.electronAPI?.connectGitHub?.();

		unsubCode?.();
		unsubProgress?.();
		deviceArea.hidden = true;
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = false));

		if (result?.error) {
			errLine.textContent = result.error;
			errLine.hidden = false;
			return;
		}

		if (!state.CONFIG.github) state.CONFIG.github = {};
		state.HAS_STARRED = result?.hasStarred ?? false;
		state.TOKEN_EXPIRED = false;
		state.CONFIG.github.accessToken = "__has_token__";
		if (!state.ORIGINAL_CONFIG.github) state.ORIGINAL_CONFIG.github = {};
		state.ORIGINAL_CONFIG.github.accessToken = "__has_token__";
		onRefresh();
	}

	async function doDisconnect() {
		actRow.querySelectorAll("button").forEach((b) => (b.disabled = true));
		await window.electronAPI?.disconnectGitHub?.();

		if (!state.CONFIG.github) state.CONFIG.github = {};
		state.HAS_STARRED = false;
		state.TOKEN_EXPIRED = false;
		state.CONFIG.github.accessToken = null;
		if (!state.ORIGINAL_CONFIG.github) state.ORIGINAL_CONFIG.github = {};
		state.ORIGINAL_CONFIG.github.accessToken = null;

		// Full refresh so gate overlays on rpcTitle/githubButton apply immediately
		onRefresh();
	}

	if (!hasToken) {
		const connectBtn = document.createElement("button");
		connectBtn.className = "btn gh-star-connect-btn";
		connectBtn.textContent = t("settings.github.connect");
		connectBtn.addEventListener("click", doConnect);
		actRow.append(connectBtn);
	} else {
		const recheckBtn = document.createElement("button");
		recheckBtn.className = "btn";
		recheckBtn.textContent = t("settings.github.recheck");
		recheckBtn.addEventListener("click", doConnect);

		const disconnectBtn = document.createElement("button");
		disconnectBtn.className = "btn gh-star-disconnect-btn";
		disconnectBtn.textContent = t("settings.github.disconnect");
		disconnectBtn.addEventListener("click", doDisconnect);

		actRow.append(recheckBtn, disconnectBtn);
	}

	wrap.append(actRow);
	return wrap;
}
