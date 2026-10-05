function accentColor(img) {
	const canvas = document.createElement("canvas");
	canvas.width = 48;
	canvas.height = 48;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	ctx.drawImage(img, 0, 0, 48, 48);

	let data;
	try {
		data = ctx.getImageData(0, 0, 48, 48).data;
	} catch {
		return null;
	}

	const buckets = new Map();
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];

		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const saturation = max === 0 ? 0 : (max - min) / max;
		const lightness = (max + min) / 510;
		const weight =
			(1 + saturation * 6) *
			Math.max(1 - Math.abs(lightness - 0.5) * 1.4, 0.05);

		const key = `${r >> 4},${g >> 4},${b >> 4}`;
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = { weight: 0, r: 0, g: 0, b: 0 };
			buckets.set(key, bucket);
		}
		bucket.weight += weight;
		bucket.r += r * weight;
		bucket.g += g * weight;
		bucket.b += b * weight;
	}

	let best = null;
	for (const bucket of buckets.values()) {
		if (!best || bucket.weight > best.weight) best = bucket;
	}
	if (!best || best.weight === 0) return null;

	return [
		Math.round(best.r / best.weight),
		Math.round(best.g / best.weight),
		Math.round(best.b / best.weight),
	];
}

function rgbToHsv([r, g, b]) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
		if (h < 0) h += 1;
	}
	const s = max === 0 ? 0 : d / max;
	return { h, s, v: max };
}

function hsvToRgb(h, s, v) {
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	let r, g, b;
	switch (i % 6) {
		case 0:
			r = v;
			g = t;
			b = p;
			break;
		case 1:
			r = q;
			g = v;
			b = p;
			break;
		case 2:
			r = p;
			g = v;
			b = t;
			break;
		case 3:
			r = p;
			g = q;
			b = v;
			break;
		case 4:
			r = t;
			g = p;
			b = v;
			break;
		default:
			r = v;
			g = p;
			b = q;
			break;
	}
	return [r * 255, g * 255, b * 255];
}

function keepBrightness([r, g, b], dark) {
	const { h, s, v } = rgbToHsv([r, g, b]);
	const minV = dark ? 0.55 : 0.35;
	const maxV = dark ? 1.0 : 0.75;
	const clamped = Math.min(Math.max(v, minV), maxV);
	return hsvToRgb(h, s, clamped);
}

function visColours(baseRgb, dark) {
	const { h } = rgbToHsv(baseRgb);
	const lowHsv = rgbToHsv(baseRgb);
	const low = hsvToRgb(h, Math.max(lowHsv.s, 0.55), 1);
	const high = hsvToRgb((h + 1 / 6) % 1, Math.max(lowHsv.s, 0.55), 1);
	return [keepBrightness(low, dark), keepBrightness(high, dark)];
}

function tintFromArt([r, g, b], dark) {
	const max = Math.max(r, g, b) / 255;
	const min = Math.min(r, g, b) / 255;
	const lightness = (max + min) / 2;
	const target = dark ? 0.3 : 0.72;
	if (lightness < 0.01) {
		const v = target * 255;
		return [v, v, v];
	}
	const scale = target / lightness;
	return [
		Math.min((r / 255) * scale, 1) * 255,
		Math.min((g / 255) * scale, 1) * 255,
		Math.min((b / 255) * scale, 1) * 255,
	];
}

function lerpColour(a, b, t) {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}

function rgba([r, g, b], alpha) {
	return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${Math.max(0, Math.min(1, alpha))})`;
}

function isDarkTheme() {
	return document.body?.classList?.contains("ym-dark-theme") ?? true;
}

function drawShadedRect(ctx, x, y, w, h, topColour, bottomColour) {
	if (w <= 0 || h <= 0) return;
	const gradient = ctx.createLinearGradient(x, y, x, y + h);
	gradient.addColorStop(0, topColour);
	gradient.addColorStop(1, bottomColour);
	ctx.fillStyle = gradient;
	ctx.fillRect(x, y, w, h);
}
