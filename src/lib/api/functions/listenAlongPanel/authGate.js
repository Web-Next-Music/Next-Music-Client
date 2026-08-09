function LaPanelAuthGate(props) {
	const { React, handlers } = props;
	const h = React.createElement;

	return h(
		"div",
		{ className: "nmc-la-panel-authgate" },
		LaDiscordIcon(h, 40),
		h(
			"div",
			{ className: "nmc-la-panel-authgate-text" },
			"Sign in with Discord in ",
			h(
				"a",
				{
					className: "nmc-la-panel-authgate-link",
					onClick: (event) => {
						event.preventDefault();
						handlers.onOpenSettings?.();
					},
				},
				"Settings",
			),
			", then come back.",
		),
	);
}
