export function getPath(obj, path) {
	return path.split(".").reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

export function setPath(obj, path, value) {
	const keys = path.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object")
			cur[keys[i]] = {};
		cur = cur[keys[i]];
	}
	cur[keys[keys.length - 1]] = value;
}
