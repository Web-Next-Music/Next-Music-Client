const _mp3UrlMap = new Map();
const _mp3KeyMap = new Map(); // AES-128-CTR key hex per trackId
const _customTrackMap = new Map(); // trackId -> { url, key, codec, bitrate, quality }
const _customTrackMetaMap = new Map(); // trackId -> public meta used by UI/RPC

function patchFileInfo() {
	const appRequire = getAppRequire();
	const moduleMap = appRequire?.m;
	if (!moduleMap) return;

	for (const moduleId of Object.keys(moduleMap)) {
		try {
			const mod = appRequire(moduleId);
			const proto = mod?.v?.prototype;
			if (!proto?.getFileInfo || !proto?.getFileInfoBatch) continue;

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
				}
				return result;
			};

			proto.getFileInfoBatch = async function (...args) {
				const result = await origGetFileInfoBatch.call(this, ...args);
				for (const info of result?.downloadInfos ?? []) {
					if (info?.url && info?.trackId) {
						_mp3UrlMap.set(String(info.trackId), info.url);
						_mp3KeyMap.set(String(info.trackId), info.key ?? "");
					}
				}
				return result;
			};

			break;
		} catch {}
	}
}

patchFileInfo();
