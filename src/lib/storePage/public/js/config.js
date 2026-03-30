// ── Button order configuration ────────────────────────────────────────────────
//   "toggle"   — кнопка Enable / Disable
//   "delete"   — кнопка удаления (иконка корзины)
//   "settings" — кнопка открытия handleEvents.json (показывается только если файл есть)
//   "download" — кнопка Download (только для не-установленных элементов)
//   "update"   — кнопка Update; при её наличии "toggle" автоматически сворачивается в иконку
//   "readme"   — иконка README в заголовке карточки (не в .card-actions, а в .card-name)

// Карточки из магазина (вкладки Addons / Themes) — когда элемент УЖЕ установлен
const CARD_BUTTONS_INSTALLED = ["toggle", "settings", "delete"];

// Карточки из магазина — когда элемент ЕЩЁ НЕ установлен
const CARD_BUTTONS_NOT_INSTALLED = ["download", "settings"];

// Карточки на вкладке Custom / Installed (локальные файлы и папки)
const CARD_BUTTONS_CUSTOM = ["toggle", "settings", "delete"];

// Кнопки, которые появляются после успешного скачивания (inline-обновление)
const CARD_BUTTONS_AFTER_DOWNLOAD = ["toggle", "settings", "delete"];

// Кнопки установленной карточки, когда доступно обновление
const CARD_BUTTONS_WITH_UPDATE = ["update", "toggle", "settings", "delete"];
