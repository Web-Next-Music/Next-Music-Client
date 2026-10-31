function createEditorModal(React, StoreButton) {
	const h = React.createElement;
	const renderText = (content, props = {}) => {
		const Text = window.nextmusicApi?.getSiteComponents()?.components?.Text;
		return Text
			? h(Text, { variant: "span", size: "m", ...props }, content)
			: h("span", { className: props.className }, content);
	};

	const renderHeading = (content) => {
		const Heading =
			window.nextmusicApi?.getSiteComponents()?.components?.Heading;
		return Heading
			? h(
					Heading,
					{
						variant: "h4",
						size: "xs",
						weight: "bold",
						className: "nmc-settings-heading",
					},
					content,
				)
			: h("h4", { className: "nmc-settings-heading" }, content);
	};

	function ColorSetting({ id, label, value, onChange }) {
		const [open, setOpen] = React.useState(false);
		const { Modal, Button, Slider } =
			window.nextmusicApi?.getSiteComponents()?.components || {};
		const [text, setText] = React.useState(value);
		const hueRef = React.useRef(0);
		const saturationRef = React.useRef(0);
		React.useEffect(() => setText(value), [value]);
		React.useEffect(() => {
			if (!open || Modal) return undefined;
			const closeOnEscape = (event) => {
				if (event.key !== "Escape") return;
				event.stopImmediatePropagation();
				setOpen(false);
			};
			window.addEventListener("keydown", closeOnEscape, true);
			return () => window.removeEventListener("keydown", closeOnEscape, true);
		}, [open, Modal]);
		const valid = /^#[\da-f]{6}$/i.test(value);
		const rgb = valid
			? value.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16) / 255)
			: [0, 0, 0];
		const max = Math.max(...rgb);
		const min = Math.min(...rgb);
		const delta = max - min;
		const hue =
			delta === 0
				? 0
				: max === rgb[0]
					? ((rgb[1] - rgb[2]) / delta + 6) % 6
					: max === rgb[1]
						? (rgb[2] - rgb[0]) / delta + 2
						: (rgb[0] - rgb[1]) / delta + 4;
		if (delta) hueRef.current = Math.round(hue * 60);
		if (max) saturationRef.current = Math.round((delta / max) * 100);
		const hsv = [hueRef.current, saturationRef.current, Math.round(max * 100)];
		const setChannel = (index, number) => {
			const next = [...hsv];
			next[index] = number;
			if (index === 0) hueRef.current = number;
			if (index === 1) saturationRef.current = number;
			const [hueValue, saturation, brightness] = [
				next[0] / 60,
				next[1] / 100,
				next[2] / 100,
			];
			const chroma = brightness * saturation;
			const x = chroma * (1 - Math.abs((hueValue % 2) - 1));
			const offset = brightness - chroma;
			const components =
				hueValue < 1
					? [chroma, x, 0]
					: hueValue < 2
						? [x, chroma, 0]
						: hueValue < 3
							? [0, chroma, x]
							: hueValue < 4
								? [0, x, chroma]
								: hueValue < 5
									? [x, 0, chroma]
									: [chroma, 0, x];
			onChange(
				"#" +
					components
						.map((part) =>
							Math.round((part + offset) * 255)
								.toString(16)
								.padStart(2, "0"),
						)
						.join(""),
			);
		};
		const trigger = h(
			Button || "button",
			{
				id,
				type: "button",
				className: "nmc-color-trigger",
				"aria-label": label,
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				radius: Button ? "xxxl" : undefined,
				size: Button ? "s" : undefined,
				onClick: () => setOpen(true),
			},
			h("span", {
				className: "nmc-color-swatch",
				style: { backgroundColor: value },
			}),
			renderText(value),
		);
		const panel = h(
			"div",
			{ className: "nmc-color-panel" },
			h(
				"label",
				{ className: "nmc-color-hex" },
				renderText("HEX", { size: "l", weight: "medium" }),
				h("input", {
					type: "text",
					value: text,
					maxLength: 7,
					spellCheck: false,
					onChange: (event) => {
						const next = event.target.value;
						setText(next);
						if (/^#[\da-f]{6}$/i.test(next)) onChange(next);
					},
					onBlur: () => {
						if (!/^#[\da-f]{6}$/i.test(text)) setText(value);
					},
				}),
			),
			[t("colorHue"), t("colorSaturation"), t("colorBrightness")].map(
				(name, index) =>
					h(
						"label",
						{ key: name, className: "nmc-color-channel" },
						renderText(name, { size: "l", weight: "medium" }),
						Slider
							? h(Slider, {
									"aria-label": name,
									min: 0,
									maxValue: index === 0 ? 360 : 100,
									value: hsv[index],
									showThumbVariant: "always",
									thumbSize: "s",
									trackSize: "xs",
									onChange: (number) => setChannel(index, number),
								})
							: h("input", {
									type: "range",
									className: "nmc-range-fallback",
									min: 0,
									max: index === 0 ? 360 : 100,
									value: hsv[index],
									onChange: (event) =>
										setChannel(index, Number(event.target.value)),
								}),
						h("output", null, renderText(hsv[index], { size: "s" })),
					),
			),
		);
		const close = () => setOpen(false);
		const dialog = !open
			? null
			: Modal
				? h(
						Modal,
						{
							open: true,
							onClose: close,
							onOpenChange: (visible) => {
								if (!visible) close();
							},
							header: renderHeading(label),
							labelClose: t("btnClose"),
							placement: "center",
							overlayColor: "full",
							className: "nmc-color-modal",
							headerClassName: "nmc-native-modal-header",
							"aria-label": label,
						},
						panel,
					)
				: h(
						"div",
						{
							className: "nmc-color-modal-bg",
							onClick: (event) => {
								if (event.target === event.currentTarget) close();
							},
						},
						h(
							"div",
							{
								className: "nmc-color-modal-fallback",
								role: "dialog",
								"aria-modal": true,
								"aria-label": label,
							},
							h(
								"div",
								{ className: "nmc-color-modal-head" },
								renderHeading(label),
								h(
									"button",
									{
										type: "button",
										className: "nmc-settings-close",
										"aria-label": t("btnClose"),
										onClick: close,
									},
									"×",
								),
							),
							panel,
						),
					);
		return h("div", { className: "nmc-color" }, trigger, dialog);
	}

	return function EditorModal({ name, onClose }) {
		const [data, setData] = React.useState(null);
		const [loaded, setLoaded] = React.useState(false);
		const [status, setStatus] = React.useState("");
		const [error, setError] = React.useState(false);

		const dataRef = React.useRef(null);
		const queue = React.useRef(Promise.resolve());
		const revision = React.useRef(0);
		const site = window.nextmusicApi?.getSiteComponents()?.components || {};
		const { Modal, Switch, Menu, MenuItem, Slider, Icon } = site;
		const themeAnchor =
			document.getElementById("nmc-store-root")?.parentElement;
		const theme = getComputedStyle(themeAnchor || document.body);
		const themeColors = Object.fromEntries(
			[
				"--ym-controls-color-primary-default-enabled",
				"--ym-controls-color-primary-default-hovered",
				"--ym-controls-color-primary-default-pressed",
				"--ym-controls-color-primary-on_default-enabled",
			].map((key) => [key, theme.getPropertyValue(key).trim()]),
		);

		React.useEffect(() => {
			let alive = true;
			storeJson("GET", "/api/read-handle-events", { name })
				.then((res) => {
					const parsed = JSON.parse(res.content);
					if (alive) {
						dataRef.current = parsed;
						setData(parsed);
						setLoaded(true);
					}
				})
				.catch((err) => {
					if (!alive) return;
					setError(true);
					setStatus(t("settingsLoadFailed") + ": " + err.message);
				});
			return () => {
				alive = false;
			};
		}, [name]);

		React.useEffect(() => {
			if (Modal) return undefined;
			const onKey = (event) => {
				if (event.key === "Escape") onClose();
			};
			window.addEventListener("keydown", onKey);
			return () => window.removeEventListener("keydown", onKey);
		}, [Modal, onClose]);

		const save = (next) => {
			const current = ++revision.current;

			setStatus("");
			setError(false);
			queue.current = queue.current
				.catch(() => {})
				.then(() =>
					storeJson(
						"POST",
						"/api/save-handle-events",
						{},
						JSON.stringify({ name, content: JSON.stringify(next, null, 2) }),
					),
				)

				.catch((err) => {
					if (current === revision.current) {
						setError(true);
						setStatus(t("statusSaveFailed") + ": " + err.message);
					}
				});
		};

		const update = (sectionIndex, itemIndex, key, value, buttonIndex) => {
			const next = structuredClone(dataRef.current);
			const item = next.sections[sectionIndex].items[itemIndex];
			if (buttonIndex === undefined) item[key] = value;
			else item.buttons[buttonIndex][key] = value;
			dataRef.current = next;
			setData(next);
			save(next);
		};

		const renderItem = (item, sectionIndex, itemIndex) => {
			if (!item || typeof item !== "object") return null;
			const label = item.name || item.id || item.type;
			const id = `nmc-setting-${sectionIndex}-${itemIndex}`;
			const change = (key, value, buttonIndex) =>
				update(sectionIndex, itemIndex, key, value, buttonIndex);
			let control;
			if (item.type === "button" && typeof item.bool === "boolean") {
				control = Switch
					? h(Switch, {
							id,
							"aria-label": label,
							isChecked: item.bool,
							onChange: (checked) => change("bool", checked),
						})
					: h("input", {
							id,
							type: "checkbox",
							role: "switch",
							checked: item.bool,
							onChange: (event) => change("bool", event.target.checked),
						});
			} else if (
				item.type === "selector" &&
				item.options &&
				typeof item.options === "object"
			) {
				control =
					Menu && MenuItem
						? h(
								Menu,
								{
									label:
										item.options[String(item.selected)]?.name ||
										String(item.selected),
									ariaLabel: label,
									lockScroll: false,
									portalNode:
										document
											.querySelector(".nmc-settings-modal")
											?.closest('[role="dialog"]') || undefined,
									size: "s",
									radius: "xxxl",
									icon: Icon
										? h(Icon, { variant: "chevronDown", size: "xxs" })
										: undefined,
								},
								Object.entries(item.options).map(([key, option]) =>
									h(MenuItem, {
										key,
										label: option?.name || key,
										onClick: () =>
											change(
												"selected",
												typeof item.selected === "number" ? Number(key) : key,
											),
									}),
								),
							)
						: h(
								"select",
								{
									id,
									value: String(item.selected),
									onChange: (event) =>
										change(
											"selected",
											typeof item.selected === "number"
												? Number(event.target.value)
												: event.target.value,
										),
								},
								Object.entries(item.options).map(([key, option]) =>
									h("option", { key, value: key }, option?.name || key),
								),
							);
			} else if (item.type === "slider" && typeof item.value === "number") {
				control = h(
					"div",
					{ className: "nmc-setting-range" },
					Slider &&
						Number.isFinite(item.min) &&
						Number.isFinite(item.max) &&
						item.max > item.min
						? h(Slider, {
								id,
								"aria-label": label,
								min: 0,
								maxValue: item.max - item.min,
								step: item.step,
								value: item.value - item.min,
								showThumbVariant: "always",
								thumbSize: "s",
								trackSize: "xs",
								onChange: (value) =>
									change("value", Number((value + item.min).toPrecision(12))),
							})
						: h("input", {
								id,
								className: "nmc-range-fallback",
								type: "range",
								min: item.min,
								max: item.max,
								step: item.step,
								value: item.value,
								onChange: (event) =>
									change("value", Number(event.target.value)),
							}),
					h("output", { htmlFor: id }, renderText(item.value, { size: "s" })),
				);
			} else if (item.type === "color" && typeof item.input === "string") {
				control = h(ColorSetting, {
					id,
					label,
					value: item.input,
					onChange: (value) => change("input", value),
				});
			} else if (item.type === "text" && Array.isArray(item.buttons)) {
				control = h(
					"div",
					{ className: "nmc-setting-texts" },
					item.buttons.map((button, index) =>
						h("input", {
							key: index,
							id: index === 0 ? id : undefined,
							type: "text",
							"aria-label":
								item.buttons.length > 1
									? `${label}: ${button.name || index + 1}`
									: label,
							value: button.text ?? "",
							onChange: (event) => change("text", event.target.value, index),
						}),
					),
				);
			} else {
				control = h(
					"span",
					{ className: "nmc-setting-unsupported" },
					renderText(t("settingsUnsupported")),
				);
			}
			return h(
				"div",
				{ className: "nmc-setting", key: itemIndex },
				h(
					"div",
					{ className: "nmc-setting-info" },
					h(
						"label",
						{ htmlFor: id },
						renderText(label, { size: "l", weight: "medium" }),
					),
					item.description &&
						h(
							"div",
							{ className: "nmc-setting-description" },
							renderText(item.description, { size: "s", weight: "regular" }),
						),
				),
				h("div", { className: "nmc-setting-control" }, control),
			);
		};

		const sections = Array.isArray(data?.sections) ? data.sections : null;

		const content = h(
			"div",
			{ className: "nmc-modal nmc-settings-modal", style: themeColors },
			!Modal &&
				h(
					"div",
					{ className: "nmc-modal-head" },
					renderHeading(name),
					h(
						"button",
						{
							type: "button",
							className: "nmc-settings-close",
							"aria-label": t("btnClose"),
							onClick: onClose,
						},
						"×",
					),
				),
			h(
				"div",
				{ className: "nmc-modal-body nmc-scroll" },
				sections
					? sections.map((section, index) =>
							h(
								"section",
								{ key: index, className: "nmc-settings-section" },
								section?.title &&
									h(
										"h2",
										null,
										renderText(section.title, { size: "l", weight: "medium" }),
									),
								Array.isArray(section?.items) &&
									section.items.map((item, itemIndex) =>
										renderItem(item, index, itemIndex),
									),
							),
						)
					: loaded && h("div", null, renderText(t("settingsUnsupported"))),
			),
			(status || (!loaded && !error)) &&
				h(
					"div",
					{
						className: error
							? "nmc-settings-status error"
							: "nmc-settings-status",
						role: "status",
					},
					renderText(status || t("modalLoading"), { size: "s" }),
					error &&
						loaded &&
						h(
							"button",
							{ type: "button", onClick: () => save(dataRef.current) },
							t("btnSave"),
						),
				),
		);
		if (Modal) {
			return h(
				Modal,
				{
					open: true,
					onClose,
					onOpenChange: (open) => {
						if (!open) onClose();
					},
					header: renderHeading(name),
					labelClose: t("btnClose"),
					placement: "center",
					overlayColor: "full",
					className: "nmc-native-modal",
					headerClassName: "nmc-native-modal-header",
					contentClassName: "nmc-native-modal-content",
					"aria-label": name,
				},
				content,
			);
		}
		return h(
			"div",
			{
				className: "nmc-modal-bg",
				onClick: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
			},
			h(
				"div",
				{
									className: "nmc-settings-dialog",
									role: "dialog",
									"aria-modal": true,
									"aria-label": name,
								},
				content,
			),
		);
	};
}
