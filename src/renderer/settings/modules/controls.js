import { state } from "./state.js";
import { getPath, setPath } from "./utils.js";
import { fieldName, fieldDesc } from "./i18n.js";
import { scheduleSave } from "./dirty.js";

export function mkToggle(path) {
	const wrap = document.createElement("label");
	wrap.className = "toggle";
	const inp = document.createElement("input");
	inp.type = "checkbox";
	inp.checked = !!getPath(state.CONFIG, path);
	inp.addEventListener("change", () => {
		setPath(state.CONFIG, path, inp.checked);
		scheduleSave();
	});
	const track = document.createElement("span");
	track.className = "t-track";
	wrap.append(inp, track);
	return wrap;
}

export function mkText(path) {
	const inp = document.createElement("input");
	inp.type = "text";
	inp.className = "inp";
	inp.value = getPath(state.CONFIG, path) ?? "";
	inp.addEventListener("input", () => {
		setPath(state.CONFIG, path, inp.value);
		scheduleSave();
	});
	return inp;
}

export function mkNumber(path) {
	const inp = document.createElement("input");
	inp.type = "number";
	inp.className = "inp num";
	inp.value = getPath(state.CONFIG, path) ?? 0;
	inp.addEventListener("input", () => {
		const v = parseInt(inp.value, 10);
		setPath(state.CONFIG, path, isNaN(v) ? 0 : v);
		scheduleSave();
	});
	return inp;
}

export function mkSelect(path, optionsFn) {
	const sel = document.createElement("select");
	sel.className = "sel";
	function populate() {
		const current = getPath(state.CONFIG, path) ?? "";
		sel.innerHTML = "";
		const opts = optionsFn();
		const list = opts.length ? opts : [{ value: current, label: current }];
		list.forEach(({ value, label }) => {
			const o = document.createElement("option");
			o.value = value;
			o.textContent = label;
			if (value === current) o.selected = true;
			sel.append(o);
		});
	}
	populate();
	sel._repopulate = populate;
	sel.addEventListener("change", () => {
		setPath(state.CONFIG, path, sel.value);
		if (!path.endsWith("language")) scheduleSave();
		window.electronAPI?.setLanguage?.(sel.value);
	});
	return sel;
}

export function mkArray(path) {
	const ta = document.createElement("textarea");
	ta.className = "ta";
	ta.placeholder = "https://example.com/script.js";
	const arr = getPath(state.CONFIG, path);
	ta.value = Array.isArray(arr) ? arr.join("\n") : "";
	ta.addEventListener("input", () => {
		const lines = ta.value
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
		setPath(state.CONFIG, path, lines);
		scheduleSave();
	});
	return ta;
}

export function mkRow(field) {
	const row = document.createElement("div");
	row.className = field.type === "array" ? "row col" : "row";

	const lbl = document.createElement("div");
	lbl.className = "lbl";

	const name = document.createElement("div");
	name.className = "lbl-name";
	name.textContent = fieldName(field.path);
	lbl.append(name);

	const desc = fieldDesc(field.path);
	if (desc) {
		const d = document.createElement("div");
		d.className = "lbl-desc";
		d.textContent = desc;
		lbl.append(d);
	}

	row.append(lbl);

	let control;
	switch (field.type) {
		case "bool":
			control = mkToggle(field.path);
			break;
		case "number":
			control = mkNumber(field.path);
			break;
		case "select":
			control = mkSelect(field.path, field.optionsFn);
			break;
		case "array":
			control = mkArray(field.path);
			break;
		default:
			control = mkText(field.path);
			break;
	}
	row.append(control);
	return { row, control };
}
