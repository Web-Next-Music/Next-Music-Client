import { createHash } from "node:crypto";

function isMusicPage(value) {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			/^music\.yandex\.(ru|com|by|kz|uz)$/.test(url.hostname)
		);
	} catch {
		return false;
	}
}

async function getClientDownloadInfo(trackId) {
	const visited = new Set();
	for (const element of document.querySelectorAll("*")) {
		const key = Object.keys(element).find((key) =>
			key.startsWith("__reactFiber"),
		);
		let fiber = key ? element[key] : null;
		while (fiber && !visited.has(fiber)) {
			visited.add(fiber);
			const container = fiber.memoizedProps?.value;
			if (
				container?.bindings?.TracksResource &&
				typeof container.get === "function"
			) {
				try {
					return await container.get("TracksResource").getStorageData(
						{ trackId },
						{ signal: AbortSignal.timeout(20000) },
					);
				} catch (error) {
					throw new Error(
						`Music download-info failed${error.statusCode ? ` (HTTP ${error.statusCode})` : ""}; check track availability and subscription`,
					);
				}
			}
			fiber = fiber.return;
		}
	}
	throw new Error("Music client session unavailable: wait for the page to load");
}

export function selectMp3(data) {
	const entries = data?.result ?? data;
	if (!Array.isArray(entries))
		throw new Error("Invalid download-info response");
	const selected = entries
		.filter(
			(entry) =>
				entry.codec === "mp3" &&
				!entry.preview &&
				!entry.drm &&
				entry.downloadInfoUrl,
		)
		.sort((a, b) => Number(b.bitrateInKbps) - Number(a.bitrateInKbps))[0];
	if (!selected)
		throw new Error("No full DRM-free MP3 available for this track");
	return selected;
}

export function parseDownloadInfo(text) {
	if (text.trimStart().startsWith("{")) return JSON.parse(text);
	const decode = (value) =>
		value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
			const named = {
				"&amp;": "&",
				"&lt;": "<",
				"&gt;": ">",
				"&quot;": '"',
				"&apos;": "'",
			};
			return (
				named[entity] ??
				String.fromCodePoint(
					entity.startsWith("&#x")
						? Number.parseInt(entity.slice(3, -1), 16)
						: Number(entity.slice(2, -1)),
				)
			);
		});
	return Object.fromEntries(
		["host", "path", "ts", "s"].map((key) => {
			const value = text.match(new RegExp(`<${key}>([^<]*)</${key}>`))?.[1];
			return [key, value === undefined ? undefined : decode(value)];
		}),
	);
}

export function buildMp3Url({ host, path, ts, s }) {
	if (
		typeof host !== "string" ||
		!/^[-a-z\d.]+\.yandex\.(net|ru)$/i.test(host) ||
		typeof path !== "string" ||
		!path.startsWith("/") ||
		/[#\s\\]/.test(path) ||
		!/^[A-Za-z0-9._~-]{1,128}$/.test(String(ts)) ||
		[".", ".."].includes(String(ts)) ||
		typeof s !== "string" ||
		!s
	)
		throw new Error("Invalid MP3 download descriptor");
	const hash = createHash("md5")
		.update(`XGRlBW9FXlekgbPrRHuSiA${path.slice(1)}${s}`)
		.digest("hex");
	return `https://${host}/get-mp3/${hash}/${ts}${path}`;
}

export async function downloadTrackAudio(event, trackId) {
	const { url } = await resolveTrackDownload(event, trackId);
	const response = await fetch(url, {
		redirect: "error",
		signal: AbortSignal.timeout(120000),
	});
	if (!response.ok)
		throw new Error(`MP3 download failed (HTTP ${response.status})`);
	return new Uint8Array(await response.arrayBuffer());
}

export async function resolveTrackDownload(event, trackId) {
	if (
		event.sender !== global.mainWindow?.webContents ||
		event.senderFrame !== event.sender.mainFrame ||
		!isMusicPage(event.senderFrame.url)
	)
		throw new Error("Download resolver is only available to the music window");
	if (!/^\d+(?::\d+)?$/.test(String(trackId)))
		throw new Error("Invalid track ID");
	const data = await event.sender.executeJavaScript(
		`(${getClientDownloadInfo.toString()})(${JSON.stringify(String(trackId))})`,
	);
	const selected = selectMp3(data);
	const descriptorUrl = new URL(selected.downloadInfoUrl);
	if (
		!["http:", "https:"].includes(descriptorUrl.protocol) ||
		!/^[-a-z\d.]+\.yandex\.(net|ru)$/i.test(descriptorUrl.hostname) ||
		descriptorUrl.username ||
		descriptorUrl.password ||
		descriptorUrl.port
	)
		throw new Error("Invalid download-info URL");
	descriptorUrl.protocol = "https:";
	const descriptor = await fetch(descriptorUrl, {
		redirect: "error",
		signal: AbortSignal.timeout(20000),
		credentials: "omit",
	});
	if (!descriptor.ok)
		throw new Error(`MP3 descriptor failed (HTTP ${descriptor.status})`);
	return {
		url: buildMp3Url(parseDownloadInfo(await descriptor.text())),
	};
}
