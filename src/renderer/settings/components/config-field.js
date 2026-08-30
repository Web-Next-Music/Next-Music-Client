import { LitElement, html, nothing } from "lit";
import { state } from "../modules/state.js";
import { getPath, setPath, keepSelectValue } from "../modules/utils.js";
import { fieldName, fieldDesc, t } from "../modules/i18n.js";
import { scheduleSave } from "../modules/dirty.js";

class ConfigField extends LitElement {
	static properties = {
		node: { attribute: false },
		gated: { type: Boolean },
	};

	createRenderRoot() {
		return this;
	}

	get #path() {
		return this.node?.path;
	}

	#commit(value) {
		const path = this.#path;
		setPath(state.CONFIG, path, value);
		if (this.node.type === "select") {
			if (!path.endsWith("language")) scheduleSave();
			window.electronAPI?.setLanguage?.(value);
			return;
		}
		scheduleSave();
	}

	#current() {
		return getPath(state.CONFIG, this.#path);
	}

	repopulate() {
		this.#populateSelect();
	}

	#populateSelect() {
		const sel = this.querySelector("mdui-select");
		if (!sel || !this.node.optionsFn) return;
		const current = this.#current() ?? "";
		sel.innerHTML = "";
		const opts = this.node.optionsFn();
		const list = opts.length ? opts : [{ value: current, label: current }];
		for (const { value, label } of list) {
			const o = document.createElement("mdui-menu-item");
			o.value = value;
			o.textContent = label;
			sel.append(o);
		}
		sel.value = current;
	}

	firstUpdated() {
		if (this.node.type === "select") {
			const sel = this.querySelector("mdui-select");
			this.#populateSelect();
			if (sel) keepSelectValue(sel);
		}
	}

	#renderControl() {
		const { type } = this.node;
		const value = this.#current();
		const off = this.gated || nothing;
		const cls = this.gated ? "star-gate-blocked" : nothing;

		if (type === "bool") {
			return html`<mdui-switch
				class=${cls}
				?disabled=${off}
				?checked=${!!value}
				@change=${(e) => this.#commit(e.target.checked)}
			></mdui-switch>`;
		}
		if (type === "number") {
			return html`<mdui-text-field
				class="num ${this.gated ? "star-gate-blocked" : ""}"
				variant="outlined"
				type="number"
				?disabled=${off}
				.value=${value || ""}
				@input=${(e) => {
					const raw = e.target.value.trim();
					if (raw === "") return this.#commit("");
					const n = parseInt(e.target.value, 10);
					this.#commit(Number.isNaN(n) ? "" : n);
				}}
			></mdui-text-field>`;
		}
		if (type === "array") {
			return html`<mdui-text-field
				class="wide ${this.gated ? "star-gate-blocked" : ""}"
				variant="outlined"
				rows="4"
				placeholder="https://example.com/script.js"
				?disabled=${off}
				.value=${Array.isArray(value) ? value.join("\n") : ""}
				@input=${(e) =>
					this.#commit(
						e.target.value
							.split("\n")
							.map((s) => s.trim())
							.filter(Boolean),
					)}
			></mdui-text-field>`;
		}
		if (type === "select") {
			return html`<mdui-select
				class=${cls}
				variant="outlined"
				?disabled=${off}
				@change=${(e) => this.#commit(e.target.value)}
			></mdui-select>`;
		}
		return html`<mdui-text-field
			class=${cls}
			variant="outlined"
			?disabled=${off}
			.value=${value ?? ""}
			@input=${(e) => this.#commit(e.target.value)}
		></mdui-text-field>`;
	}

	render() {
		if (!this.node) return nothing;
		const desc = fieldDesc(this.#path);
		return html`
			<div class="lbl">
				<div class="lbl-name">${fieldName(this.#path)}</div>
				${desc ? html`<div class="lbl-desc">${desc}</div>` : nothing}
				${
					this.gated
						? html`<div class="star-gate-notice">
							${t("settings.starGate")}
						</div>`
						: nothing
				}
			</div>
			${this.#renderControl()}
		`;
	}
}

if (!customElements.get("config-field")) {
	customElements.define("config-field", ConfigField);
}
