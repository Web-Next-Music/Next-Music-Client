export const THEMES = ["default", "gtavi"];

export function resolveTheme(args, now = new Date()) {
	let override;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--theme-override") {
			override = args[i + 1];
		} else if (args[i].startsWith("--theme-override=")) {
			override = args[i].slice("--theme-override=".length);
		}
	}

	if (override !== undefined && THEMES.includes(override)) return override;
	if (args.includes("--theme-override") || override !== undefined) {
		console.warn(
			`Invalid theme override. Available themes: ${THEMES.join(", ")}`,
		);
	}

	return now.getMonth() === 10 && now.getDate() >= 19 && now.getDate() <= 26
		? "gtavi"
		: "default";
}
