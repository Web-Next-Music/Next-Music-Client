const EDITOR_STYLE_ID = "nmc-cm-style";

let _editorAssets = null;

async function ensureCodeMirror() {
	if (window.CodeMirror) return true;

	if (!_editorAssets) {
		_editorAssets = window.nmcStore?.loadEditor
			? window.nmcStore.loadEditor()
			: Promise.reject(new Error("no editor bridge"));
	}

	const assets = await _editorAssets;
	if (assets?.css && !document.getElementById(EDITOR_STYLE_ID)) {
		const style = document.createElement("style");
		style.id = EDITOR_STYLE_ID;
		style.textContent = assets.css;
		document.head.appendChild(style);
	}

	return !!window.CodeMirror;
}

function readHandleEvents(name) {
	return storeJson("GET", "/api/read-handle-events", { name })
		.then((res) => JSON.stringify(JSON.parse(res.content), null, 2))
		.catch(() => null);
}

function openHandleEventsExternally(name) {
	storeJson(
		"POST",
		"/api/open-handle-events",
		{},
		JSON.stringify({ name }),
	).catch(() => {});
}

function codeMirrorOptions(value, keys) {
	return {
		value,
		mode: { name: "javascript", json: true },
		lineNumbers: true,
		matchBrackets: true,
		autoCloseBrackets: true,
		styleActiveLine: true,
		foldGutter: true,
		gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
		tabSize: 2,
		indentWithTabs: false,
		extraKeys: keys,
	};
}

function createEditorModal(React, StoreButton) {
	const h = React.createElement;

	return function EditorModal({ name, onClose }) {
		const hostRef = React.useRef(null);
		const cmRef = React.useRef(null);
		const [status, setStatus] = React.useState("");
		const [invalid, setInvalid] = React.useState(false);
		const [ready, setReady] = React.useState(false);
		const [saving, setSaving] = React.useState(false);

		const save = React.useCallback(async () => {
			const cm = cmRef.current;
			if (!cm) return;

			let pretty;
			try {
				pretty = JSON.stringify(JSON.parse(cm.getValue()), null, 2);
			} catch (err) {
				setInvalid(true);
				setStatus(t("statusInvalidJson", { message: err.message }));
				return;
			}

			setSaving(true);
			try {
				await storeJson(
					"POST",
					"/api/save-handle-events",
					{},
					JSON.stringify({ name, content: pretty }),
				);
				cm.setValue(pretty);
				cm.clearHistory();
				setStatus(t("statusSaved"));
				setTimeout(() => setStatus(""), 2500);
			} catch (err) {
				setInvalid(true);
				setStatus(t("statusSaveFailed") + ": " + err.message);
			}
			setSaving(false);
		}, [name]);

		React.useEffect(() => {
			let alive = true;

			(async () => {
				const content = await readHandleEvents(name);
				const loaded = await ensureCodeMirror().catch(() => false);
				if (!alive) return;

				if (!loaded || content === null) {
					openHandleEventsExternally(name);
					onClose();
					return;
				}

				const cm = window.CodeMirror(
					hostRef.current,
					codeMirrorOptions(content, {
						"Ctrl-S": save,
						"Cmd-S": save,
						Esc: onClose,
					}),
				);

				cm.on("change", () => {
					try {
						JSON.parse(cm.getValue());
						setInvalid(false);
						setStatus("");
					} catch (err) {
						setInvalid(true);
						setStatus(
							t("statusInvalidJson", { message: err.message }),
						);
					}
				});

				cmRef.current = cm;
				setReady(true);
				requestAnimationFrame(() => {
					cm.refresh();
					cm.focus();
				});
			})();

			return () => {
				alive = false;
				cmRef.current = null;
			};
		}, [name, onClose, save]);

		React.useEffect(() => {
			const onKey = (event) => {
				if (event.key === "Escape") onClose();
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [onClose]);

		return h(
			"div",
			{
				className: "nmc-modal-bg",
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
			},
			h(
				"div",
				{ className: "nmc-modal" },
				h(
					"div",
					{ className: "nmc-modal-head" },
					h(
						"div",
						{ className: "nmc-modal-title" },
						t("modalEditorTitle", { name }),
					),
					h(
						"div",
						{ className: "nmc-modal-badge" },
						t("modalEditorBadge"),
					),
				),
				h(
					"div",
					{ className: "nmc-modal-body flush" },
					h("div", { ref: hostRef }),
				),
				h(
					"div",
					{ className: "nmc-modal-foot" },
					h(
						"div",
						{
							className: invalid
								? "nmc-modal-status error"
								: "nmc-modal-status",
						},
						status || (ready ? "" : t("modalLoading")),
					),
					h(StoreButton, { label: t("btnCancel"), onClick: onClose }),
					h(StoreButton, {
						variant: "primary",
						label: t("btnSave"),
						busy: saving,
						disabled: invalid || !ready,
						onClick: save,
					}),
				),
			),
		);
	};
}
