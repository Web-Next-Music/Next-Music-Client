const STORE_ICON_VARIANTS = {
	download: "download",
	settings: "settings",
	close: "close",
	trash: "bucket",
	warning: "exclamation",
	info: "info",
};

function storeIcon(React, name, props) {
	const Icon = getSiteComponents().Icon;
	const variant = STORE_ICON_VARIANTS[name];
	if (!Icon || !variant) return null;
	return React.createElement(
		"span",
		{
			...props,
			className: props?.className ? "nmc-icon " + props.className : "nmc-icon",
			"aria-hidden": true,
		},
		React.createElement(Icon, { variant, size: "xxs" }),
	);
}
