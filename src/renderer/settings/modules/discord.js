import { state } from "./state.js";
import { t } from "./i18n.js";

export function buildDiscordSignInBlock(onRefresh) {
	const hasToken = !!state.DISCORD_HAS_TOKEN;

	const wrap = document.createElement("div");
	wrap.className = "gh-star-block";

	const header = document.createElement("div");
	header.className = "gh-star-header";

	const icon = document.createElement("span");
	icon.className = "gh-star-icon";
	icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>`;

	const title = document.createElement("span");
	title.className = "gh-star-title";
	title.textContent = t("settings.discord.title");

	const badge = document.createElement("span");
	badge.className = "gh-star-badge" + (hasToken ? " gh-star-badge--ok" : "");
	badge.textContent = hasToken
		? state.DISCORD_USERNAME
			? `@${state.DISCORD_USERNAME}`
			: t("settings.discord.linked")
		: t("settings.discord.notLinked");

	header.append(icon, title, badge);
	wrap.append(header);

	const desc = document.createElement("div");
	desc.className = "gh-star-desc";
	desc.textContent = t("settings.discord.desc");
	wrap.append(desc);

	const errLine = document.createElement("div");
	errLine.className = "gh-star-error";
	errLine.hidden = true;
	wrap.append(errLine);

	const actRow = document.createElement("div");
	actRow.className = "gh-star-actions";

	async function doConnect() {
		actRow
			.querySelectorAll("mdui-button")
			.forEach((b) => (b.disabled = true));
		errLine.hidden = true;

		const result = await window.electronAPI?.connectDiscord?.();

		if (!result?.ok) {
			errLine.textContent = result?.error || t("settings.discord.failed");
			errLine.hidden = false;
			actRow
				.querySelectorAll("mdui-button")
				.forEach((b) => (b.disabled = false));
			return;
		}

		state.DISCORD_HAS_TOKEN = true;
		state.DISCORD_USERNAME = result.username || null;
		onRefresh();
	}

	async function doDisconnect() {
		actRow
			.querySelectorAll("mdui-button")
			.forEach((b) => (b.disabled = true));
		await window.electronAPI?.disconnectDiscord?.();

		state.DISCORD_HAS_TOKEN = false;
		state.DISCORD_USERNAME = null;
		onRefresh();
	}

	if (!hasToken) {
		const connectBtn = document.createElement("mdui-button");
		connectBtn.variant = "filled";
		connectBtn.textContent = t("settings.discord.connect");
		connectBtn.addEventListener("click", doConnect);
		actRow.append(connectBtn);
	} else {
		const disconnectBtn = document.createElement("mdui-button");
		disconnectBtn.variant = "text";
		disconnectBtn.className = "gh-star-disconnect-btn";
		disconnectBtn.textContent = t("settings.discord.disconnect");
		disconnectBtn.addEventListener("click", doDisconnect);
		actRow.append(disconnectBtn);
	}

	wrap.append(actRow);
	return wrap;
}
