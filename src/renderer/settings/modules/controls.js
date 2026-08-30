import { state } from "./state.js";
import { getPath, setPath } from "./utils.js";
import { scheduleSave } from "./dirty.js";

export function mkToggle(path) {
	const sw = document.createElement("mdui-switch");
	sw.checked = !!getPath(state.CONFIG, path);
	sw.addEventListener("change", () => {
		setPath(state.CONFIG, path, sw.checked);
		scheduleSave();
	});
	return sw;
}
