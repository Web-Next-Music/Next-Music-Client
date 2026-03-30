// ── handleEvents.json in-store editor (CodeMirror 5) ─────────────────────────
let _editorAddonName = null;
let _editorOriginal = "";
let _cmEditor = null;

function _initCM() {
    if (_cmEditor) return;
    const host = document.getElementById("editor-cm-host");
    _cmEditor = CodeMirror(host, {
        mode: { name: "javascript", json: true },
        theme: "nm-dark",
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        styleActiveLine: true,
        foldGutter: true,
        gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
        tabSize: 2,
        indentWithTabs: false,
        lineWrapping: false,
        extraKeys: {
            "Ctrl-S": () => saveHandleEvents(),
            "Cmd-S": () => saveHandleEvents(),
            Escape: () => closeEditorModal(),
            Tab: (cm) => cm.execCommand("indentMore"),
            "Shift-Tab": (cm) => cm.execCommand("indentLess"),
        },
    });
    _cmEditor.on("change", () => {
        try {
            JSON.parse(_cmEditor.getValue());
            setEditorStatus("", false);
            document.getElementById("editor-save-btn").disabled = false;
        } catch (e) {
            setEditorStatus(
                t("store.statusInvalidJson", { message: e.message }),
                true,
            );
            document.getElementById("editor-save-btn").disabled = true;
        }
    });
}

async function openHandleEvents(name, btn, event) {
    event && event.stopPropagation();
    if (!btn || btn.disabled) return;

    const prev = btn.innerHTML;
    btn.innerHTML = '<span class="spin"></span>';
    btn.disabled = true;

    try {
        const r = await fetch(
            "/api/read-handle-events?name=" + encodeURIComponent(name),
        );
        const data = await r.json();
        if (!data.ok) throw new Error(data.error || "Failed to read file");

        _editorAddonName = name;
        _editorOriginal = formatJson(data.content);

        document.getElementById("editor-modal-title").textContent = t(
            "store.modalEditorTitle",
            { name },
        );
        setEditorStatus("", false);
        document.getElementById("editor-save-btn").disabled = false;
        document.getElementById("editor-modal-bg").classList.remove("hidden");

        _initCM();
        _cmEditor.setValue(_editorOriginal);
        _cmEditor.clearHistory();
        requestAnimationFrame(() => {
            _cmEditor.refresh();
            _cmEditor.focus();
        });
    } catch (e) {
        await api("/api/open-handle-events", { name }).catch(() => {});
    } finally {
        btn.innerHTML = prev;
        btn.disabled = false;
    }
}

function formatJson(str) {
    try {
        return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
        return str;
    }
}

function closeEditorModal() {
    document.getElementById("editor-modal-bg").classList.add("hidden");
    _editorAddonName = null;
    _editorOriginal = "";
    setEditorStatus("", false);
}

function setEditorStatus(msg, isError) {
    const el = document.getElementById("editor-status-msg");
    el.textContent = msg;
    el.className =
        "editor-status-msg" +
        (isError ? " editor-status-err" : msg ? " editor-status-ok" : "");
}

async function saveHandleEvents() {
    if (!_cmEditor) return;
    const content = _cmEditor.getValue();
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        setEditorStatus(
            t("store.statusInvalidJson", { message: e.message }),
            true,
        );
        return;
    }
    const saveBtn = document.getElementById("editor-save-btn");
    const prevHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spin"></span>';

    try {
        const pretty = JSON.stringify(parsed, null, 2);
        const data = await api("/api/save-handle-events", {
            name: _editorAddonName,
            content: pretty,
        });
        if (!data.ok) throw new Error(data.error || "Save failed");
        _editorOriginal = pretty;
        _cmEditor.setValue(pretty);
        _cmEditor.clearHistory();
        setEditorStatus(t("store.statusSaved"), false);
        setTimeout(() => setEditorStatus("", false), 2500);
    } catch (e) {
        setEditorStatus(
            t("store.statusInvalidJson", {
                message: e.message || t("store.statusSaveFailed"),
            }),
            true,
        );
    } finally {
        saveBtn.innerHTML = prevHtml;
        saveBtn.disabled = false;
    }
}

// ── Check handleEvents.json and show/hide settings button ────────────────────
async function checkAndShowSettingsBtn(name, btnId, isInstalled) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    try {
        const r = await fetch(
            "/api/check-handle-events?name=" + encodeURIComponent(name),
        );
        const data = await r.json();
        if (data.exists) {
            btn.style.display = "";
            btn.disabled = !isInstalled;
        }
    } catch {
        // silently ignore
    }
}
