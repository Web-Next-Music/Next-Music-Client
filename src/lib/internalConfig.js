function isPlainObject(value) {
	return (
		value !== null && typeof value === "object" && !Array.isArray(value)
	);
}

function isEqualValue(prevValue, nextValue) {
	if (Object.is(prevValue, nextValue)) return true;

	if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
		if (prevValue.length !== nextValue.length) return false;
		return prevValue.every((item, index) =>
			isEqualValue(item, nextValue[index]),
		);
	}

	if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
		const keys = new Set([...Object.keys(prevValue), ...Object.keys(nextValue)]);
		for (const key of keys) {
			if (!isEqualValue(prevValue[key], nextValue[key])) return false;
		}
		return true;
	}

	return false;
}

const restartRules = [
	{ path: "programSettings.richPresence", needRestart: false },
	{ path: "github", needRestart: false },
];

export function pathNeedsRestart(path) {
	const matchedRule = restartRules.find(
		(rule) => path === rule.path || path.startsWith(rule.path + "."),
	);

	if (matchedRule) return matchedRule.needRestart;

	return true;
}

function collectChangedPaths(prevValue, nextValue, basePath = "") {
	if (isEqualValue(prevValue, nextValue)) return [];

	const prevIsObject = isPlainObject(prevValue);
	const nextIsObject = isPlainObject(nextValue);

	if (!prevIsObject || !nextIsObject) {
		return basePath ? [basePath] : [];
	}

	const keys = new Set([...Object.keys(prevValue), ...Object.keys(nextValue)]);
	const changedPaths = [];

	for (const key of keys) {
		const path = basePath ? `${basePath}.${key}` : key;
		changedPaths.push(...collectChangedPaths(prevValue[key], nextValue[key], path));
	}

	return changedPaths;
}

export function configChangeNeedsRestart(prevConfig, nextConfig) {
	const changedPaths = collectChangedPaths(prevConfig ?? {}, nextConfig ?? {});

	return {
		needRestart: changedPaths.some((path) => pathNeedsRestart(path)),
		changedPaths,
	};
}
