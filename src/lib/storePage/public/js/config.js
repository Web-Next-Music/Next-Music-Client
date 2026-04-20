// Button order configuration
//   "toggle"   — Enable / Disable button
//   "delete"   — delete button (trash icon)
//   "settings" — opens handleEvents.json (shown only if the file exists)
//   "download" — Download button (only for not-yet-installed items)
//   "update"   — Update button; when present, "toggle" collapses to an icon automatically
//   "readme"   — README icon in the card header (in .card-name, not .card-actions)

// Store cards (Addons / Themes tabs) — when the item IS already installed
const CARD_BUTTONS_INSTALLED = ["toggle", "settings", "delete"];

// Store cards — when the item is NOT yet installed
const CARD_BUTTONS_NOT_INSTALLED = ["download", "settings"];

// Cards on the Custom / Installed tab (local files and folders)
const CARD_BUTTONS_CUSTOM = ["toggle", "settings", "delete"];

// Buttons shown after a successful download (inline update)
const CARD_BUTTONS_AFTER_DOWNLOAD = ["toggle", "settings", "delete"];

// Installed card buttons when an update is available
const CARD_BUTTONS_WITH_UPDATE = ["update", "toggle", "settings", "delete"];
