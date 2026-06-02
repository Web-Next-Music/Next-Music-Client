import "./style.scss";

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

	let strings = {};

	function showActions() {
		actionsEl.hidden = false;
		statusEl.hidden = true;
		progressEl.hidden = true;
	}

	function showProgress() {
		actionsEl.hidden = true;
		statusEl.hidden = false;
		progressEl.hidden = false;
	}

	api.onAvailable(({ version, strings: s }) => {
		strings = s || {};

		titleEl.textContent = strings.available || "Update available";
		versionEl.textContent = version ? `v${version}` : "";
		confirmBtn.textContent = strings.update || "Update";
		cancelBtn.textContent = strings.cancel || "Cancel";

		showActions();
		spinnerView.hidden = true;
		updateView.hidden = false;
	});

	api.onProgress(({ percent, bytesPerSecond }) => {
		showProgress();

		const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
		progressBar.style.width = `${pct}%`;

		const tmpl = strings.downloading || "Downloading… {percent}% · {speed}";
		statusEl.textContent = tmpl
			.replace("{percent}", String(pct))
			.replace("{speed}", formatSpeed(bytesPerSecond));
	});

	api.onStatus(({ text }) => {
		showProgress();
		if (text) statusEl.textContent = text;
	});

	api.onError(({ message }) => {
		showActions();
		progressBar.style.width = "0%";
		statusEl.hidden = false;
		statusEl.textContent = `${strings.error || "Update failed"}${
			message ? `: ${message}` : ""
		}`;
	});

	confirmBtn.addEventListener("click", () => {
		progressBar.style.width = "0%";
		showProgress();
		statusEl.textContent = strings.preparing || "Preparing…";
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
