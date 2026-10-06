const _mp3UrlMap = new Map();
const _mp3KeyMap = new Map(); // AES-128-CTR key hex per trackId
const _codecMap = new Map(); // codec string per trackId (e.g. "mp3", "aac")
const _customTrackMap = new Map(); // trackId -> { url, key, codec, bitrate, quality }
const _customTrackMetaMap = new Map(); // trackId -> public meta used by UI/RPC

function patchFileInfo() {
	const appRequire = getAppRequire();
	const moduleMap = appRequire?.m;
	if (!moduleMap) return;

	for (const moduleId of Object.keys(moduleMap)) {
		try {
			const mod = appRequire(moduleId);
			let proto = null;
			for (const exp of Object.values(mod ?? {})) {
				if (
					typeof exp === "function" &&
					typeof exp.prototype?.getFileInfo === "function" &&
					typeof exp.prototype?.getFileInfoBatch === "function"
				) {
					proto = exp.prototype;
					break;
				}
			}
			if (!proto) continue;

			const origGetFileInfo = proto.getFileInfo;
			const origGetFileInfoBatch = proto.getFileInfoBatch;

			proto.getFileInfo = async function (...args) {
				const arg = args[0];
				const trackId = arg?.trackId ?? arg?.id ?? String(arg);

				if (_customTrackMap.has(String(trackId))) {
					const custom = _customTrackMap.get(String(trackId));
					// Return downloadInfo for custom track instead of calling API
					return {
						trackId: String(trackId),
						downloadInfo: {
							trackId: String(trackId),
							url: custom.url,
							urls: [custom.url],
							key: custom.key ?? "",
							codec: custom.codec ?? "mp3",
							bitrate: custom.bitrate ?? 320,
							gain: false,
							preview: false,
							transport: "raw",
						},
					};
				}

				const result = await origGetFileInfo.call(this, ...args);
				const di = result?.downloadInfo;
				const id = di?.trackId || result?.trackId;
				if (di?.url && id) {
					_mp3UrlMap.set(String(id), di.url);
					// Capture AES key while it's still present (before FckCensor clears it)
					_mp3KeyMap.set(String(id), di.key ?? "");
					_codecMap.set(String(id), di.codec ?? "mp3");
				}
				return result;
			};

			proto.getFileInfoBatch = async function (...args) {
				const result = await origGetFileInfoBatch.call(this, ...args);
				for (const info of result?.downloadInfos ?? []) {
					if (info?.url && info?.trackId) {
						_mp3UrlMap.set(String(info.trackId), info.url);
						_mp3KeyMap.set(String(info.trackId), info.key ?? "");
						_codecMap.set(String(info.trackId), info.codec ?? "mp3");
					}
				}
				return result;
			};

			break;
		} catch {}
	}
}

patchFileInfo();
