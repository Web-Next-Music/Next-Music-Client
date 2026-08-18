function LaMoreIcon(h) {
	return h(
		"svg",
		{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor" },
		h("circle", { cx: 3, cy: 8, r: 1.5 }),
		h("circle", { cx: 8, cy: 8, r: 1.5 }),
		h("circle", { cx: 13, cy: 8, r: 1.5 }),
	);
}

function LaPanelCloseIcon(h) {
	return h(
		"svg",
		{
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 2.2,
			strokeLinecap: "round",
		},
		h("path", { d: "M3 3l10 10M13 3L3 13" }),
	);
}

function LaInfoIcon(h) {
	return h(
		"svg",
		{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "none" },
		h("circle", {
			cx: 8,
			cy: 8,
			r: 6.5,
			stroke: "currentColor",
			strokeWidth: 1.4,
		}),
		h("circle", { cx: 8, cy: 5.1, r: 0.9, fill: "currentColor" }),
		h("path", {
			d: "M8 7.4v4.3",
			stroke: "currentColor",
			strokeWidth: 1.4,
			strokeLinecap: "round",
		}),
	);
}

function LaVolumeIcon(h, muted) {
	return h(
		"svg",
		{
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.4,
			strokeLinecap: "round",
			strokeLinejoin: "round",
		},
		h("path", { d: "M2 6h2.5L9 3v10L4.5 10H2z", fill: "currentColor" }),
		muted
			? h("path", { d: "M11.5 6.5l3 3M14.5 6.5l-3 3" })
			: h("path", { d: "M11.3 5.8a3.6 3.6 0 010 4.4" }),
	);
}

function LaDiscordIcon(h, size = 13) {
	return h(
		"svg",
		{
			width: size,
			height: size,
			viewBox: "0 0 127.14 96.36",
			fill: "currentColor",
		},
		h("path", {
			d: "M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z",
		}),
	);
}
