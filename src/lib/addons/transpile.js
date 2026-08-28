import path from "path";

const ADDON_SCRIPT_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

const TRANSFORMS_BY_EXTENSION = {
	".ts": ["typescript"],
	".tsx": ["typescript", "jsx"],
	".jsx": ["jsx"],
};

let sucrasePromise = null;

function loadSucrase() {
	if (!sucrasePromise) {
		sucrasePromise = import("sucrase");
	}
	return sucrasePromise;
}

function isTypeDeclaration(fileName) {
	return fileName.toLowerCase().endsWith(".d.ts");
}

function scriptExtension(filePath) {
	return path.extname(filePath).toLowerCase();
}

async function transpileAddonScript(code, filePath, label) {
	const transforms = TRANSFORMS_BY_EXTENSION[scriptExtension(filePath)];

	if (!transforms) return code;

	try {
		const { transform } = await loadSucrase();

		const result = transform(code, {
			transforms,
			jsxRuntime: "classic",
			jsxPragma: "React.createElement",
			jsxFragmentPragma: "React.Fragment",
			production: true,
			filePath,
		});

		return result.code;
	} catch (err) {
		console.error(
			`[Addons] Transpile failed for '${label}':`,
			err.message ?? err,
		);
		return null;
	}
}

export {
	ADDON_SCRIPT_EXTENSIONS,
	isTypeDeclaration,
	scriptExtension,
	transpileAddonScript,
};
