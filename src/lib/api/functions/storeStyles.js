const STORE_ROOT_ID = "nmc-store-root";
const STORE_STYLE_ID = "nmc-store-style";
const STORE_ACTIVE_CLASS = "nmc-store-active";
const STORE_ACCENT = "#2bfef5";

const STORE_TOKENS_CSS = __CSS_FILE__("./styles/storeTokens.css").replace(
	/__STORE_ACCENT__/g,
	STORE_ACCENT,
);

const STORE_HEADER_CSS = __CSS_FILE__("./styles/storeHeader.css");

const STORE_CARD_CSS = __CSS_FILE__("./styles/storeCard.css");

const STORE_BUTTON_CSS = __CSS_FILE__("./styles/storeButton.css");

const STORE_TABS_CSS = __CSS_FILE__("./styles/storeTabs.css");

const STORE_README_CSS = __CSS_FILE__("./styles/storeReadme.css");

const STORE_MODAL_CSS = __CSS_FILE__("./styles/storeModal.css").replace(
	/__STORE_ACCENT__/g,
	STORE_ACCENT,
);

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
