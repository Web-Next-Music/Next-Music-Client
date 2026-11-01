import fs from "fs";
import path from "path";
import {
	httpsGet,
	ghContents,
	normalizeGitUrl,
	resolveSubmoduleUrl,
	loadGitmodules,
} from "./github/index.js";

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024;
const MAX_ENTRIES = 10000;

function safeArchivePath(name) {
	if (
		typeof name !== "string" ||
		!name ||
		name.includes("\\") ||
		name.startsWith("/") ||
		/^[A-Za-z]:/.test(name) ||
		/[\x00-\x1f:]/.test(name) ||
		name.split("/").some((part) => part === ".." || part === ".")
	)
		throw new Error("Unsafe archive path");
	return name;
}

export async function downloadTree(
	contentPath,
	destDir,
	owner,
	repo,
	gitmodules,
	token,
) {
	const items = await ghContents(owner, repo, contentPath, token, true);
	fs.mkdirSync(destDir, { recursive: true });

	if (!Array.isArray(items)) throw new Error("Invalid GitHub directory");
	for (const item of items) {
		if (
			typeof item.name !== "string" ||
			item.name.includes("/") ||
			item.name.includes("\\")
		)
			throw new Error("Invalid GitHub entry");
		safeArchivePath(item.name);
		if (item.type === "file") {
			const r = await httpsGet(item.download_url);
			if (r.statusCode !== 200)
				throw new Error(`Download failed: HTTP ${r.statusCode}`);
			fs.writeFileSync(path.join(destDir, item.name), r.body);
		} else if (item.type === "dir") {
			await downloadTree(
				item.path,
				path.join(destDir, item.name),
				owner,
				repo,
				gitmodules,
				token,
			);
		} else if (item.type === "submodule" || item.type === "commit") {
			const rawUrl =
				gitmodules[item.path] ||
				(await resolveSubmoduleUrl(owner, repo, item.path, token)) ||
				"";

			const subUrl = normalizeGitUrl(rawUrl);

			const m =
				subUrl &&
				subUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/);

			if (m) {
				const subGm = await loadGitmodules(m[1], m[2]);
				await downloadTree(
					"",
					path.join(destDir, item.name),
					m[1],
					m[2],
					subGm,
					token,
				);
			}
		}
	}
}

function tarSize(header) {
	const field = header.subarray(124, 136);
	if (field[0] & 0x80) {
		if (field[0] & 0x40) throw new Error("Invalid tar size");
		let size = BigInt(field[0] & 0x7f);
		for (const byte of field.subarray(1)) size = (size << 8n) | BigInt(byte);
		if (size > BigInt(Number.MAX_SAFE_INTEGER))
			throw new Error("Invalid tar size");
		return Number(size);
	}
	const text = field.toString("latin1");
	if (!/^[ \0]*[0-7]+[ \0]*$/.test(text)) throw new Error("Invalid tar size");
	return parseInt(text.replace(/^[ \0]+/, ""), 8);
}

export async function downloadAndExtractTarGz(url, destDir) {
	const r = await httpsGet(url, {}, 60000);
	if (r.statusCode !== 200)
		throw new Error(`Failed to download tar.gz: HTTP ${r.statusCode}`);

	const { gunzipSync } = await import("zlib");
	const tarBuf = gunzipSync(r.body, { maxOutputLength: MAX_ARCHIVE_SIZE });
	extractTarBuffer(tarBuf, destDir);
}

function extractTarBuffer(tarBuf, destDir) {
	const topDirs = new Set();
	let offset = 0;
	let entryCount = 0;

	while (offset + 512 <= tarBuf.length) {
		const header = tarBuf.slice(offset, offset + 512);
		const shortName = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
		const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
		const rawName = prefix ? prefix + "/" + shortName : shortName;

		if (!rawName) break;
		const name = rawName.replace(/^(\.\/)+/, "") || ".";
		if (name !== ".") safeArchivePath(name);
		if (++entryCount > MAX_ENTRIES) throw new Error("Too many archive entries");
		const storedChecksum = parseInt(
			header.toString("ascii", 148, 156).replace(/\0.*$/, "").trim(),
			8,
		);
		let checksum = 0;
		for (let i = 0; i < 512; i++)
			checksum += i >= 148 && i < 156 ? 32 : header[i];
		if (checksum !== storedChecksum) throw new Error("Invalid tar checksum");

		const size = tarSize(header);
		if (![0, 48, 53].includes(header[156]))
			throw new Error("Unsupported tar entry");
		if (name === "." && (header[156] !== 53 || size !== 0))
			throw new Error("Invalid tar root entry");
		if (
			!Number.isSafeInteger(size) ||
			offset + 512 + Math.ceil(size / 512) * 512 > tarBuf.length
		)
			throw new Error("Truncated tar archive");
		const topPart = name.split("/")[0];

		if (topPart && topPart !== ".") topDirs.add(topPart);

		offset += 512 + Math.ceil(size / 512) * 512;
	}
	const stripPrefix = topDirs.size === 1 ? [...topDirs][0] + "/" : "";

	offset = 0;
	while (offset + 512 <= tarBuf.length) {
		const header = tarBuf.slice(offset, offset + 512);
		const shortName = header.toString("utf8", 0, 100).replace(/\0.*$/, "");
		const prefix = header.toString("utf8", 345, 500).replace(/\0.*$/, "");
		const rawName = prefix ? prefix + "/" + shortName : shortName;

		if (!rawName) break;
		const name = rawName.replace(/^(\.\/)+/, "") || ".";

		const typeFlag = header.toString("utf8", 156, 157);
		if (!["0", "\0", "5"].includes(typeFlag))
			throw new Error("Unsupported tar entry");
		const size = tarSize(header);
		offset += 512;

		if (typeFlag === "0" || typeFlag === "" || typeFlag === "\0") {
			const relName =
				stripPrefix && name.startsWith(stripPrefix)
					? name.slice(stripPrefix.length)
					: name;

			if (relName && !relName.endsWith("/")) {
				const outPath = path.join(destDir, ...relName.split("/"));
				fs.mkdirSync(path.dirname(outPath), { recursive: true });
				fs.writeFileSync(outPath, tarBuf.slice(offset, offset + size));
			}
		}

		offset += Math.ceil(size / 512) * 512;
	}
}

async function _extractZipBuffer(zipBuf, destDir) {
	function findEOCD(buf) {
		for (let i = buf.length - 22; i >= 0; i--) {
			if (
				buf[i] === 0x50 &&
				buf[i + 1] === 0x4b &&
				buf[i + 2] === 0x05 &&
				buf[i + 3] === 0x06
			)
				return i;
		}
		return -1;
	}

	const eocdOffset = findEOCD(zipBuf);
	if (eocdOffset === -1) throw new Error("Invalid ZIP: EOCD not found");

	if (
		eocdOffset + 22 > zipBuf.length ||
		eocdOffset + 22 + zipBuf.readUInt16LE(eocdOffset + 20) !== zipBuf.length ||
		zipBuf.readUInt16LE(eocdOffset + 4) !== 0 ||
		zipBuf.readUInt16LE(eocdOffset + 6) !== 0 ||
		zipBuf.readUInt16LE(eocdOffset + 8) !== zipBuf.readUInt16LE(eocdOffset + 10)
	)
		throw new Error("Invalid ZIP directory");
	const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
	const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
	const cdEnd = cdOffset + zipBuf.readUInt32LE(eocdOffset + 12);
	if (totalEntries > MAX_ENTRIES || cdEnd !== eocdOffset)
		throw new Error("Invalid ZIP directory");
	let totalSize = 0;

	const topDirs = new Set();
	let pos = cdOffset;

	for (let e = 0; e < totalEntries; e++) {
		if (pos + 46 > cdEnd || zipBuf.readUInt32LE(pos) !== 0x02014b50)
			throw new Error("Invalid ZIP entry");

		const fnLen = zipBuf.readUInt16LE(pos + 28);
		const extraLen = zipBuf.readUInt16LE(pos + 30);
		const commentLen = zipBuf.readUInt16LE(pos + 32);
		const name = zipBuf.toString("utf8", pos + 46, pos + 46 + fnLen);
		if (pos + 46 + fnLen + extraLen + commentLen > cdEnd)
			throw new Error("Truncated ZIP entry");
		safeArchivePath(name);
		const flags = zipBuf.readUInt16LE(pos + 8);
		const mode = zipBuf.readUInt32LE(pos + 38) >>> 16;
		if (
			flags & 1 ||
			(mode & 0xf000 && ![0x8000, 0x4000].includes(mode & 0xf000))
		)
			throw new Error("Unsupported ZIP entry");
		totalSize += zipBuf.readUInt32LE(pos + 24);
		if (totalSize > MAX_ARCHIVE_SIZE) throw new Error("ZIP too large");
		const topPart = name.split("/")[0];
		if (topPart) topDirs.add(topPart);
		pos += 46 + fnLen + extraLen + commentLen;
	}

	const stripPrefix = topDirs.size === 1 ? [...topDirs][0] + "/" : "";

	pos = cdOffset;
	for (let e = 0; e < totalEntries; e++) {
		if (pos + 46 > cdEnd || zipBuf.readUInt32LE(pos) !== 0x02014b50)
			throw new Error("Invalid ZIP entry");

		const fnLen = zipBuf.readUInt16LE(pos + 28);
		const extraLen = zipBuf.readUInt16LE(pos + 30);
		const commentLen = zipBuf.readUInt16LE(pos + 32);
		const localOffset = zipBuf.readUInt32LE(pos + 42);
		const name = zipBuf.toString("utf8", pos + 46, pos + 46 + fnLen);

		pos += 46 + fnLen + extraLen + commentLen;

		const relName =
			stripPrefix && name.startsWith(stripPrefix)
				? name.slice(stripPrefix.length)
				: name;

		if (!relName || relName.endsWith("/")) continue;

		if (
			localOffset + 30 > cdOffset ||
			zipBuf.readUInt32LE(localOffset) !== 0x04034b50
		)
			throw new Error("Invalid ZIP local header");
		const lhFnLen = zipBuf.readUInt16LE(localOffset + 26);
		const lhExtraLen = zipBuf.readUInt16LE(localOffset + 28);
		const dataOffset = localOffset + 30 + lhFnLen + lhExtraLen;
		const compMethod = zipBuf.readUInt16LE(localOffset + 8);
		const compSize = zipBuf.readUInt32LE(
			pos - (46 + fnLen + extraLen + commentLen) + 20,
		);
		const expectedSize = zipBuf.readUInt32LE(
			pos - (46 + fnLen + extraLen + commentLen) + 24,
		);
		if (
			dataOffset + compSize > cdOffset ||
			compMethod !==
				zipBuf.readUInt16LE(pos - (46 + fnLen + extraLen + commentLen) + 10)
		)
			throw new Error("Invalid ZIP data");
		const compData = zipBuf.slice(dataOffset, dataOffset + compSize);

		let fileData;
		if (compMethod === 0) {
			fileData = compData;
		} else if (compMethod === 8) {
			const { inflateRawSync } = await import("zlib");
			fileData = inflateRawSync(compData, {
				maxOutputLength: Math.max(1, expectedSize),
			});
		} else {
			throw new Error(`Unsupported ZIP compression method: ${compMethod}`);
		}

		if (fileData.length !== expectedSize) throw new Error("Invalid ZIP size");
		const outPath = path.join(destDir, ...relName.split("/"));
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, fileData);
	}
}

export async function downloadSourceZip(owner, repo, destDir, token) {
	for (const branch of ["main", "master", "HEAD"]) {
		let r;
		try {
			r = await httpsGet(
				`https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`,
				token ? { Authorization: `Bearer ${token}` } : {},
				60000,
			);
		} catch {
			continue;
		}

		if (r.statusCode !== 200) continue;
		await _extractZipBuffer(r.body, destDir);

		return;
	}
	throw new Error(`Could not download source zip for ${owner}/${repo}`);
}
