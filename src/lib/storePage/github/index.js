export const GITHUB_OWNER = "Web-Next-Music";
export const GITHUB_REPO = "Next-Music-Extensions";

export {
	httpsGet,
	httpsPost,
	RateLimitError,
	getRateLimitState,
	cachedGet,
	fetchWithCache,
	CONTENTS_TTL,
	UPDATE_TTL,
	META_TTL,
} from "./httpClient.js";

export {
	normalizeGitUrl,
	parseGitmodules,
	resolveSubmoduleUrl,
	loadGitmodules,
} from "./gitmodules.js";

export {
	ghContents,
	getSection,
	getFolderMeta,
	getCatalog,
	getRemoteHeadCommit,
	getLatestNmRelease,
	repoTree,
	pLimit,
} from "./repoContent.js";

export {
	isImg,
	pickImg,
	rawUrl,
	pickImgPath,
	metaFromTree,
	findLogoRecursive,
	findBrandingDir,
} from "./branding.js";

export {
	renderMarkdown,
	fetchReadme,
	markdownContext,
	resolveRelativeUrls,
} from "./markdown.js";
