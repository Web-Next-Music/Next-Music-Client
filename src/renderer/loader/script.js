const api = window.nmcUpdate;

if (api) {
	const spinnerView = document.getElementById("spinner_view");
	const updateView = document.getElementById("update_view");
	const titleEl = document.getElementById("update_title");
	const versionEl = document.getElementById("update_version");
	const statusEl = document.getElementById("update_status");
	const actionsEl = document.getElementById("update_actions");
	const progressEl = document.getElementById("update_progress");
	const progressBar = document.getElementById("update_progress_bar");
	const confirmBtn = document.getElementById("update_confirm");
	const cancelBtn = document.getElementById("update_cancel");
	const confirmLabel = document.getElementById("update_confirm_label");

	let strings = {};

	function showActions() {
		actionsEl.hidden = false;
		statusEl.hidden = true;
		progressEl.hidden = true;
	}

	function resetButton() {
		confirmBtn.classList.remove(
			"update_btn--filling",
			"update_btn--installing",
		);
		confirmBtn.disabled = false;
		confirmBtn.style.removeProperty("--p");
		cancelBtn.hidden = false;
		confirmLabel.textContent = strings.update || "Update";
	}

	function setPercent(pct) {
		confirmBtn.classList.add("update_btn--filling");
		confirmBtn.style.setProperty("--p", `${pct}%`);
		confirmLabel.textContent = `${pct}%`;
	}

	function setInstalling(text) {
		confirmBtn.classList.remove("update_btn--filling");
		confirmBtn.classList.add("update_btn--installing");
		confirmBtn.style.setProperty("--p", "100%");
		confirmLabel.textContent = text || strings.installing || "Installing…";
	}

	api.onAvailable(({ version, strings: s }) => {
		strings = s || {};

		titleEl.textContent = strings.available || "Update available";
		versionEl.textContent = version ? `v${version}` : "";
		resetButton();
		cancelBtn.textContent = strings.cancel || "Cancel";

		showActions();
		spinnerView.hidden = true;
		updateView.hidden = false;
	});

	api.onProgress(({ percent }) => {
		const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
		if (pct >= 100) {
			setInstalling(strings.installing);
			return;
		}
		setPercent(pct);
	});

	api.onStatus(({ text }) => {
		if (!text || text === strings.preparing) return;
		setInstalling(text);
	});

	api.onError(({ message }) => {
		resetButton();
		statusEl.hidden = false;
		statusEl.textContent = `${strings.error || "Update failed"}${
			message ? `: ${message}` : ""
		}`;
	});

	confirmBtn.addEventListener("click", () => {
		statusEl.hidden = true;
		cancelBtn.hidden = true;
		confirmBtn.disabled = true;
		setPercent(0);
		api.start();
	});

	cancelBtn.addEventListener("click", () => api.cancel());
}

function formatSpeed(bytesPerSecond) {
	const bps = Number(bytesPerSecond) || 0;
	if (bps <= 0) return "";
	const units = ["B/s", "KB/s", "MB/s", "GB/s"];
	let value = bps;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
