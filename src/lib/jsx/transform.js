let sucrasePromise = null;

function loadSucrase() {
	if (!sucrasePromise) sucrasePromise = import("sucrase");
	return sucrasePromise;
}

const JSX_OPTIONS = {
	transforms: ["jsx"],
	jsxRuntime: "classic",
	jsxPragma: "React.createElement",
	jsxFragmentPragma: "React.Fragment",
	production: true,
	disableESTransforms: true,
};

export async function transpileJsx(code, filePath) {
	const { transform } = await loadSucrase();
	return transform(code, { ...JSX_OPTIONS, filePath }).code;
}
