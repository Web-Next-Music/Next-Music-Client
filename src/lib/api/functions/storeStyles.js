const STORE_ROOT_ID = "nmc-store-root";
const STORE_STYLE_ID = "nmc-store-style";
const STORE_ACTIVE_CLASS = "nmc-store-active";
const STORE_ACCENT = "#2bfef5";

const STORE_TOKENS_CSS = `
main.nmc-store-active > *:not(#nmc-store-root) {
	display: none !important;
}

#nmc-store-root {
	--nmc-accent: ${STORE_ACCENT};
	--nmc-on-accent: #000;
	--nmc-ctl: var(--ym-controls-color-secondary-default-enabled);
	--nmc-ctl-hover: var(--ym-controls-color-secondary-default-hovered);
	--nmc-ctl-pressed: var(--ym-controls-color-secondary-default-pressed);
	--nmc-txt: var(--ym-controls-color-secondary-on_default-enabled);
	--nmc-mut: var(--ym-controls-color-secondary-text-enabled);
	--nmc-err: var(--ym-controls-color-danger-default-enabled, #ff5c5c);
	--nmc-ok: var(--nmc-accent);

	--ym-controls-color-primary-default-enabled: var(--nmc-accent);
	--ym-controls-color-primary-default-hovered: var(--nmc-accent);
	--ym-controls-color-primary-default-pressed: var(--nmc-accent);
	--ym-controls-color-primary-on_default-enabled: #000;
	--ym-controls-color-secondary-outline-selected_stroke: var(--nmc-accent);
	--ym-controls-color-secondary-text-selected: var(--nmc-accent);

	display: block;
	padding: var(--ym-spacer-size-xxl);
	height: 100vh;
	box-sizing: border-box;
	overflow-y: auto;
	scrollbar-gutter: stable;
	transition: scrollbar-color 0.2s ease-in-out;
}

#nmc-store-root::-webkit-scrollbar {
	width: var(--ym-spacer-size-xxl);
}

#nmc-store-root::-webkit-scrollbar-thumb {
	background-clip: content-box;
	background-color: var(--ym-controls-color-primary-default-disabled);
	border: 0.5rem solid transparent;
	border-radius: var(--ym-radius-size-l);
	min-height: 3.125rem;
}

#nmc-store-root::-webkit-scrollbar-thumb:hover {
	background-color: var(--ym-surface-color-primary-enabled-entity);
}

@media only screen and (max-width: 1024px) {
	#nmc-store-root::-webkit-scrollbar {
		width: var(--ym-spacer-size-m);
	}

	#nmc-store-root::-webkit-scrollbar-thumb {
		border: 0.1875rem solid transparent;
	}
}
`;

const STORE_HEADER_CSS = `
#nmc-store-root .nmc-head {
	display: flex;
	align-items: center;
	gap: var(--ym-spacer-size-m);
	margin-bottom: var(--ym-spacer-size-xl);
}

#nmc-store-root .nmc-title {
	font-family: var(--ym-font-heading);
	font-size: var(--ym-font-size-headline-xl);
	line-height: var(--ym-font-line-height-headline-xl);
	font-weight: var(--ym-font-weight-bold);
	color: var(--ym-controls-color-primary-text-enabled_variant);
}

#nmc-store-root .nmc-title span {
	color: var(--nmc-accent);
}

#nmc-store-root .nmc-toolbar {
	display: flex;
	align-items: center;
	gap: var(--ym-spacer-size-l);
	margin-top: var(--ym-spacer-size-l);
	flex-wrap: wrap;
}

#nmc-store-root .nmc-empty {
	padding: var(--ym-spacer-size-xxxxl) 0;
	text-align: center;
	color: var(--ym-controls-color-primary-text-enabled);
}
`;

const STORE_CARD_CSS = `
#nmc-store-root .nmc-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
	gap: var(--ym-spacer-size-m);
	margin-top: var(--ym-spacer-size-xl);
}

#nmc-store-root .nmc-card {
	background: var(--ym-background-color-primary-enabled-popover);
	border: 1px solid var(--ym-controls-color-secondary-outline-enabled_stroke);
	border-radius: var(--ym-radius-size-xl);
	padding: var(--ym-spacer-size-l);
	display: flex;
	flex-direction: column;
	gap: var(--ym-spacer-size-m);
	transition: background var(--ym-duration-transition);
}

#nmc-store-root .nmc-card:hover {
	background: var(--ym-controls-color-secondary-default-hovered);
}

#nmc-store-root .nmc-card.disabled {
	opacity: 0.62;
}

#nmc-store-root .nmc-card-top {
	display: flex;
	gap: var(--ym-spacer-size-s);
	align-items: flex-start;
}

#nmc-store-root .nmc-logo,
#nmc-store-root .nmc-logo-ph {
	width: var(--ym-icon-size-xl);
	height: var(--ym-icon-size-xl);
	border-radius: var(--ym-radius-size-m);
	object-fit: cover;
	flex-shrink: 0;
	background: var(--nmc-ctl);
}

#nmc-store-root .nmc-logo-ph {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--ym-controls-color-primary-text-enabled);
}

#nmc-store-root .nmc-logo-ph svg {
	width: var(--ym-icon-size-xxs);
	height: var(--ym-icon-size-xxs);
}

#nmc-store-root .nmc-logo-ph.local {
	color: var(--nmc-accent);
}

#nmc-store-root .nmc-meta {
	min-width: 0;
	flex: 1 1 0;
}

#nmc-store-root .nmc-name {
	display: flex;
	align-items: center;
	gap: var(--ym-spacer-size-xxs);
	font-size: var(--ym-font-size-label-l);
	line-height: var(--ym-font-line-height-label-l);
	font-weight: var(--ym-font-weight-medium);
	color: var(--nmc-txt);
	overflow: hidden;
}

#nmc-store-root .nmc-name-text {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

#nmc-store-root .nmc-readme-icon {
	color: var(--ym-controls-color-primary-text-enabled);
	cursor: pointer;
	display: inline-flex;
	flex-shrink: 0;
}

#nmc-store-root .nmc-readme-icon:hover {
	color: var(--nmc-accent);
}

#nmc-store-root .nmc-sub {
	font-size: var(--ym-font-size-label-s);
	line-height: var(--ym-font-line-height-label-s);
	color: var(--ym-controls-color-primary-text-enabled);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

#nmc-store-root a.nmc-sub {
	cursor: pointer;
	display: block;
}

#nmc-store-root a.nmc-sub:hover {
	color: var(--nmc-accent);
}
`;

const STORE_BUTTON_CSS = `
#nmc-store-root .nmc-actions {
	display: flex;
	flex-direction: row;
	gap: var(--ym-spacer-size-xxs);
	width: 100%;
	overflow: hidden;
	align-items: center;
}

#nmc-store-root .btn {
	padding: var(--ym-spacer-size-xs) var(--ym-spacer-size-m);
	height: var(--ym-icon-size-m);
	border-radius: var(--ym-radius-size-xxxl);
	border: 1px solid var(--ym-controls-color-secondary-outline-enabled_stroke);
	font-family: inherit;
	font-size: var(--ym-font-size-label-s);
	line-height: var(--ym-font-line-height-label-s);
	font-weight: var(--ym-font-weight-medium);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--ym-spacer-size-xxs);
	background: var(--nmc-ctl);
	color: var(--nmc-txt);
	position: relative;
	overflow: hidden;
	white-space: nowrap;
	transition:
		background var(--ym-duration-transition),
		color var(--ym-duration-transition),
		border-color var(--ym-duration-transition);
}

#nmc-store-root .btn:hover:not(:disabled) {
	background: var(--nmc-ctl-hover);
}

#nmc-store-root .btn:active:not(:disabled) {
	background: var(--nmc-ctl-pressed);
}

#nmc-store-root .btn:disabled {
	opacity: 0.38;
	cursor: not-allowed;
}

#nmc-store-root .btn-primary {
	background: var(--nmc-accent);
	color: var(--nmc-on-accent);
	font-weight: var(--ym-font-weight-bold);
}

#nmc-store-root .btn-primary:hover:not(:disabled) {
	background: var(--nmc-accent);
	filter: brightness(1.08);
}

#nmc-store-root .btn-primary:active:not(:disabled) {
	background: var(--nmc-accent);
	filter: brightness(0.92);
}

#nmc-store-root .btn-danger {
	color: var(--nmc-err);
}

#nmc-store-root .btn-danger:hover:not(:disabled) {
	background: var(--nmc-ctl-hover);
	border-color: var(--nmc-err);
}

#nmc-store-root .btn-on {
	color: var(--nmc-ok);
}

#nmc-store-root .btn-off,
#nmc-store-root .btn-settings {
	color: var(--ym-controls-color-primary-text-enabled);
}

#nmc-store-root .btn-settings:hover:not(:disabled) {
	color: var(--nmc-txt);
}

#nmc-store-root .nmc-actions .btn {
	flex: 1 1 0;
	min-width: 0;
	max-width: 100%;
}

#nmc-store-root .nmc-actions .btn-icon {
	flex: 0 0 var(--ym-icon-size-m);
	width: var(--ym-icon-size-m);
	min-width: var(--ym-icon-size-m);
	max-width: var(--ym-icon-size-m);
	height: var(--ym-icon-size-m);
	padding: 0;
}

#nmc-store-root .btn .nmc-icon {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
}

#nmc-store-root .btn svg {
	flex-shrink: 0;
	width: var(--ym-icon-size-xxxs);
	height: var(--ym-icon-size-xxxs);
}

#nmc-store-root .nmc-spin {
	width: var(--ym-icon-size-xxs);
	height: var(--ym-icon-size-xxs);
	border: 2px solid currentColor;
	border-top-color: transparent;
	border-radius: var(--ym-radius-size-round);
	display: inline-block;
	animation: nmc-spin 0.7s linear infinite;
}

@keyframes nmc-spin {
	to {
		transform: rotate(360deg);
	}
}

#nmc-store-root .nmc-sb {
	padding: 0 var(--ym-spacer-size-s);
	height: var(--ym-icon-size-m);
	display: flex;
	align-items: center;
	border-radius: var(--ym-radius-size-xxxl);
	background: var(--nmc-ctl);
	font-size: var(--ym-font-size-label-s);
	color: var(--nmc-err);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
`;

const STORE_TABS_CSS = `
#nmc-store-root .nmc-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: var(--ym-spacer-size-xxs);
	margin-top: var(--ym-spacer-size-l);
}

#nmc-store-root .nmc-tab {
	padding: var(--ym-spacer-size-xs) var(--ym-spacer-size-l);
	height: var(--ym-icon-size-m);
	border-radius: var(--ym-radius-size-xxxl);
	border: 1px solid transparent;
	background: var(--nmc-ctl);
	color: var(--ym-controls-color-primary-text-enabled);
	cursor: pointer;
	font-family: inherit;
	font-size: var(--ym-font-size-label-s);
	font-weight: var(--ym-font-weight-medium);
	white-space: nowrap;
	transition: background var(--ym-duration-transition);
}

#nmc-store-root .nmc-tab:hover {
	background: var(--nmc-ctl-hover);
}

#nmc-store-root .nmc-tab.active {
	background: var(--ym-controls-color-secondary-outline-selected);
	border-color: var(--nmc-accent);
	color: var(--nmc-accent);
}

#nmc-store-root .nmc-search {
	flex: 0 1 22rem;
	min-width: 12rem;
	background: var(--nmc-ctl);
	border: 1px solid transparent;
	border-radius: var(--ym-radius-size-xxxl);
	padding: var(--ym-spacer-size-xs) var(--ym-spacer-size-l);
	color: var(--nmc-txt);
	font-family: inherit;
	font-size: var(--ym-font-size-label-m);
	outline: none;
	transition: background var(--ym-duration-transition);
}

#nmc-store-root .nmc-search:hover {
	background: var(--nmc-ctl-hover);
}

#nmc-store-root .nmc-search:focus {
	border-color: var(--nmc-accent);
}

#nmc-store-root .nmc-search::placeholder {
	color: var(--ym-controls-color-primary-text-enabled);
}
`;

const STORE_README_CSS = `
#nmc-store-root .nmc-readme {
	background: transparent;
}

#nmc-store-root .nmc-banner {
	position: fixed;
	left: 50%;
	bottom: calc(var(--player-bar-height, 10rem) + var(--ym-spacer-size-xxxxl));
	transform: translateX(-50%);
	z-index: 2147482900;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--ym-spacer-size-m);
	padding: var(--ym-spacer-size-m);
	border-radius: var(--ym-radius-size-xxxl);
	background: var(--ym-background-color-primary-enabled-popover);
}

#nmc-store-root .nmc-banner .nmc-icon {
	color: var(--nmc-accent);
	display: inline-flex;
}
`;

const STORE_MODAL_CSS = `
#nmc-store-root .nmc-modal .nmc-readme > *:first-child {
	margin-top: 0;
}

.nmc-modal-bg {
	position: fixed;
	inset: 0;
	z-index: 2147483000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.55);
	padding: var(--ym-spacer-size-xl);
}

.nmc-modal {
	display: flex;
	flex-direction: column;
	width: min(52rem, 100%);
	max-height: 85vh;
	border-radius: var(--ym-radius-size-xl);
	border: 0.0625rem solid var(--ym-outline-color-primary-disabled);
	overflow: hidden;
	background: var(--ym-background-color-primary-enabled-popover);
	color: var(--ym-controls-color-secondary-on_default-enabled);
	box-shadow: 0 1rem 3rem var(--ym-shadow-menu);
}

.nmc-modal-head {
	display: flex;
	align-items: center;
	gap: var(--ym-spacer-size-m);
	padding: var(--ym-spacer-size-l);
	border-bottom: 1px solid
		var(--ym-controls-color-secondary-outline-enabled_stroke);
}

.nmc-modal-title {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: var(--ym-font-size-label-l);
	font-weight: var(--ym-font-weight-medium);
}

.nmc-modal-badge {
	padding: 0 var(--ym-spacer-size-s);
	border-radius: var(--ym-radius-size-xxxl);
	background: var(--ym-controls-color-secondary-default-enabled);
	font-size: var(--ym-font-size-label-s);
}

.nmc-modal-body {
	flex: 1 1 auto;
	min-height: 0;
	overflow: auto;
	padding: var(--ym-spacer-size-l);
}

.nmc-modal-body.flush {
	padding: 0;
}

.nmc-scroll {
	scrollbar-gutter: stable;
	transition: scrollbar-color 0.2s ease-in-out;
}

.nmc-scroll::-webkit-scrollbar {
	width: var(--ym-spacer-size-xxl);
}

.nmc-scroll::-webkit-scrollbar-thumb {
	background-clip: content-box;
	background-color: var(--ym-controls-color-primary-default-disabled);
	border: 0.5rem solid transparent;
	border-radius: var(--ym-radius-size-l);
	min-height: 3.125rem;
}

.nmc-scroll::-webkit-scrollbar-thumb:hover {
	background-color: var(--ym-surface-color-primary-enabled-entity);
}

@media only screen and (max-width: 1024px) {
	.nmc-scroll::-webkit-scrollbar {
		width: var(--ym-spacer-size-m);
	}

	.nmc-scroll::-webkit-scrollbar-thumb {
		border: 0.1875rem solid transparent;
	}
}

#nmc-store-root .CodeMirror-vscrollbar,
#nmc-store-root .CodeMirror-hscrollbar {
	scrollbar-gutter: stable;
	transition: scrollbar-color 0.2s ease-in-out;
}

#nmc-store-root .CodeMirror-vscrollbar::-webkit-scrollbar,
#nmc-store-root .CodeMirror-hscrollbar::-webkit-scrollbar {
	width: var(--ym-spacer-size-xxl);
	height: var(--ym-spacer-size-xxl);
}

#nmc-store-root .CodeMirror-vscrollbar::-webkit-scrollbar-thumb,
#nmc-store-root .CodeMirror-hscrollbar::-webkit-scrollbar-thumb {
	background-clip: content-box;
	background-color: var(--ym-controls-color-primary-default-disabled);
	border: 0.5rem solid transparent;
	border-radius: var(--ym-radius-size-l);
	min-height: 3.125rem;
}

#nmc-store-root .CodeMirror-vscrollbar::-webkit-scrollbar-thumb:hover,
#nmc-store-root .CodeMirror-hscrollbar::-webkit-scrollbar-thumb:hover {
	background-color: var(--ym-surface-color-primary-enabled-entity);
}

.nmc-modal-foot {
	display: flex;
	align-items: center;
	gap: var(--ym-spacer-size-m);
	padding: var(--ym-spacer-size-l);
	border-top: 1px solid
		var(--ym-controls-color-secondary-outline-enabled_stroke);
}

.nmc-modal-status {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: var(--ym-font-size-label-s);
	color: var(--ym-controls-color-secondary-text-enabled);
}

.nmc-modal-status.error {
	color: #ff5c5c;
}

.nmc-modal .btn {
	padding: var(--ym-spacer-size-xs) var(--ym-spacer-size-l);
	height: var(--ym-icon-size-m);
	border-radius: var(--ym-radius-size-xxxl);
	border: 1px solid transparent;
	font-family: inherit;
	font-size: var(--ym-font-size-label-s);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: var(--ym-spacer-size-xxs);
	background: var(--ym-controls-color-secondary-default-enabled);
	color: var(--ym-controls-color-secondary-on_default-enabled);
}

.nmc-modal .btn-primary {
	background: ${STORE_ACCENT};
	color: #000;
	font-weight: var(--ym-font-weight-bold);
}

.nmc-modal .btn:disabled {
	opacity: 0.38;
	cursor: not-allowed;
}

.nmc-modal .CodeMirror {
	height: 60vh;
	font-size: 0.85rem;
	background: var(--ym-background-color-primary-enabled-basic);
	color: var(--ym-controls-color-secondary-on_default-enabled);
}

.nmc-modal .CodeMirror-gutters {
	border-right-color: transparent;
	background: var(--ym-background-color-primary-enabled-content);
}

.nmc-modal .CodeMirror-linenumber {
	color: var(--ym-controls-color-secondary-text-enabled);
}

.nmc-modal .CodeMirror-cursor {
	border-left-color: currentColor;
}

.nmc-modal .CodeMirror-selected {
	background: var(--ym-controls-color-secondary-default-pressed);
}

.nmc-modal .CodeMirror-activeline-background {
	background: var(--ym-controls-color-secondary-default-enabled);
}

.nmc-modal .CodeMirror .cm-property,
.nmc-modal .CodeMirror .cm-string {
	color: var(--nmc-accent);
}

.nmc-modal .CodeMirror .cm-number,
.nmc-modal .CodeMirror .cm-atom {
	color: #5ee87a;
}

.nmc-modal .CodeMirror .cm-keyword {
	color: #ff8a8a;
}

.nmc-modal .CodeMirror .cm-comment {
	color: var(--ym-controls-color-secondary-text-enabled);
}

.nmc-modal .CodeMirror .cm-error {
	color: var(--nmc-err);
}

.nmc-modal .CodeMirror-matchingbracket {
	color: var(--nmc-accent) !important;
}

.nmc-modal .markdown-body {
	--fgColor-default: var(--ym-controls-color-secondary-on_default-enabled);
	--fgColor-muted: var(--ym-controls-color-secondary-text-enabled);
	--fgColor-accent: var(--nmc-accent);
	--fgColor-danger: var(--nmc-err);
	--bgColor-default: transparent;
	--bgColor-muted: var(--ym-background-color-primary-enabled-content);
	--borderColor-default: var(
		--ym-controls-color-secondary-outline-enabled_stroke
	);
	--borderColor-muted: var(
		--ym-controls-color-secondary-outline-enabled_stroke
	);
	--color-prettylights-syntax-comment: var(
		--ym-controls-color-secondary-text-enabled
	);
	--color-prettylights-syntax-constant: var(--nmc-accent);
	--color-prettylights-syntax-entity: var(--nmc-accent);
	--color-prettylights-syntax-keyword: var(--nmc-err);
	--color-prettylights-syntax-string: var(--nmc-accent);
	--color-prettylights-syntax-variable: var(
		--ym-controls-color-secondary-on_default-enabled
	);
}
`;

const STORE_CSS = [
	STORE_TOKENS_CSS,
	STORE_HEADER_CSS,
	STORE_CARD_CSS,
	STORE_BUTTON_CSS,
	STORE_TABS_CSS,
	STORE_README_CSS,
	STORE_MODAL_CSS,
].join("\n");

function ensureStoreStyle() {
	if (document.getElementById(STORE_STYLE_ID)) return;
	const style = document.createElement("style");
	style.id = STORE_STYLE_ID;
	style.textContent = STORE_CSS;
	document.head.appendChild(style);
}
