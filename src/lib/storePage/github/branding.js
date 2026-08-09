import { ghContents } from "./repoContent.js";

export function isImg(n) {
	return /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
}

export function pickImg(list) {
	return (
		list.find(
			(i) =>
				i.type === "file" &&
				/^(image|icon|logo|preview)\./i.test(i.name) &&
				isImg(i.name),
		)?.download_url ||
		list.find((i) => i.type === "file" && isImg(i.name))?.download_url ||
		null
	);
}

export function rawUrl(owner, repo, filePath) {
	const encoded = filePath.split("/").map(encodeURIComponent).join("/");
	return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${encoded}`;
}

export function pickImgPath(paths) {
	const named = paths.find(
		(p) =>
			/^(image|icon|logo|preview)\./i.test(p.split("/").pop()) &&
			isImg(p),
	);

	return named || paths.find((p) => isImg(p)) || null;
}

export function metaFromTree(owner, repo, paths, root) {
	const prefix = root ? root + "/" : "";
	const scoped = paths.filter((p) => p.startsWith(prefix));
	const rel = (p) => p.slice(prefix.length);

	const branding = scoped.filter((p) =>
		rel(p)
			.split("/")
			.slice(0, -1)
			.some((seg) => /^branding$/i.test(seg)),
	);

	const logo = pickImgPath(branding) || pickImgPath(scoped);

	const readme = scoped.find(
		(p) => !rel(p).includes("/") && /^readme\.md$/i.test(rel(p)),
	);

	return {
		logo: logo ? rawUrl(owner, repo, logo) : null,
		readme: readme ? rawUrl(owner, repo, readme) : null,
	};
}

export async function findLogoRecursive(
	owner,
	repo,
	dirPath,
	depth = 0,
	token,
) {
	if (depth > 1) return null;
	try {
		const items = await ghContents(owner, repo, dirPath, token);
		const logo = pickImg(items);
		if (logo) return logo;

		for (const sub of items.filter((i) => i.type === "dir")) {
			const found = await findLogoRecursive(
				owner,
				repo,
				sub.path,
				depth + 1,
				token,
			);
			if (found) return found;
		}
	} catch {}
	return null;
}

export async function findBrandingDir(owner, repo, items, depth = 0, token) {
	const branding = items.find(
		(i) => i.type === "dir" && /^branding$/i.test(i.name),
	);

	if (branding) return branding.path;
	if (depth >= 1) return null;

	for (const sub of items.filter((i) => i.type === "dir")) {
		try {
			const subItems = await ghContents(owner, repo, sub.path, token);
			const found = await findBrandingDir(
				owner,
				repo,
				subItems,
				depth + 1,
				token,
			);
			if (found) return found;
		} catch {}
	}
	return null;
}
