function LaPanelAuthGate(props) {
	const { React, handlers } = props;

	return (
		<div className="nmc-la-panel-authgate">
			{LaDiscordIcon(React.createElement, 40)}
			<div className="nmc-la-panel-authgate-text">
				Sign in with Discord in{" "}
				<a
					className="nmc-la-panel-authgate-link"
					onClick={(event) => {
						event.preventDefault();
						handlers.onOpenSettings?.();
					}}
				>
					Settings
				</a>
				, then come back.
			</div>
		</div>
	);
}
