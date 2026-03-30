import fs from "fs";
import path from "path";
import { httpsGet, ghContents, normalizeGitUrl, resolveSubmoduleUrl, loadGitmodules } from "./github.js";

// ── Tree downloader (non-submodule addons) ──

export async function downloadTree(contentPath, destDir, owner, repo, gitmodules) {
    const items = await ghContents(owner, repo, contentPath);
    fs.mkdirSync(destDir, { recursive: true });
    for (const item of items) {
        if (item.type === "file") {
            const r = await httpsGet(item.download_url);
            fs.writeFileSync(path.join(destDir, item.name), r.body);
        } else if (item.type === "dir") {
            await downloadTree(
                item.path,
                path.join(destDir, item.name),
                owner,
                repo,
                gitmodules,
            );
        } else if (item.type === "submodule" || item.type === "commit") {
            const rawUrl =
                gitmodules[item.path] ||
                (await resolveSubmoduleUrl(owner, repo, item.path)) ||
                "";
            const subUrl = normalizeGitUrl(rawUrl);
            const m =
                subUrl &&
                subUrl.match(
                    /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
                );
            if (m) {
                const subGm = await loadGitmodules(m[1], m[2]);
                await downloadTree(
                    "",
                    path.join(destDir, item.name),
                    m[1],
                    m[2],
                    subGm,
                );
            }
        }
    }
}

// ── tar.gz extractor ──

export async function downloadAndExtractTarGz(url, destDir) {
    const r = await httpsGet(url, {}, 60000);
    if (r.statusCode !== 200)
        throw new Error(`Failed to download tar.gz: HTTP ${r.statusCode}`);

    const { gunzipSync } = await import("zlib");
    const tarBuf = gunzipSync(r.body);

    // Detect the single top-level directory prefix to strip
    const topDirs = new Set();
    let offset = 0;
    while (offset + 512 <= tarBuf.length) {
        const header = tarBuf.slice(offset, offset + 512);
        const name = header.toString("utf8", 0, 100).replace(/\0+$/, "");
        if (!name) break;
        const sizeOctal = header.toString("utf8", 124, 136).trim().replace(/\0+$/, "");
        const size = parseInt(sizeOctal, 8) || 0;
        const topPart = name.split("/")[0];
        if (topPart) topDirs.add(topPart);
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    const stripPrefix = topDirs.size === 1 ? [...topDirs][0] + "/" : "";

    offset = 0;
    while (offset + 512 <= tarBuf.length) {
        const header = tarBuf.slice(offset, offset + 512);
        const name = header.toString("utf8", 0, 100).replace(/\0+$/, "");
        if (!name) break;
        const typeFlag = header.toString("utf8", 156, 157);
        const sizeOctal = header.toString("utf8", 124, 136).trim().replace(/\0+$/, "");
        const size = parseInt(sizeOctal, 8) || 0;
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

// ── ZIP extractor (shared buffer parser) ──

async function _extractZipBuffer(zipBuf, destDir) {
    function findEOCD(buf) {
        for (let i = buf.length - 22; i >= 0; i--) {
            if (
                buf[i] === 0x50 && buf[i + 1] === 0x4b &&
                buf[i + 2] === 0x05 && buf[i + 3] === 0x06
            )
                return i;
        }
        return -1;
    }

    const eocdOffset = findEOCD(zipBuf);
    if (eocdOffset === -1) throw new Error("Invalid ZIP: EOCD not found");

    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);

    // Detect single top-level directory to strip
    const topDirs = new Set();
    let pos = cdOffset;
    for (let e = 0; e < totalEntries; e++) {
        if (zipBuf.readUInt32LE(pos) !== 0x02014b50) break;
        const fnLen = zipBuf.readUInt16LE(pos + 28);
        const extraLen = zipBuf.readUInt16LE(pos + 30);
        const commentLen = zipBuf.readUInt16LE(pos + 32);
        const name = zipBuf.toString("utf8", pos + 46, pos + 46 + fnLen);
        const topPart = name.split("/")[0];
        if (topPart) topDirs.add(topPart);
        pos += 46 + fnLen + extraLen + commentLen;
    }
    const stripPrefix = topDirs.size === 1 ? [...topDirs][0] + "/" : "";

    pos = cdOffset;
    for (let e = 0; e < totalEntries; e++) {
        if (zipBuf.readUInt32LE(pos) !== 0x02014b50) break;
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

        const lhFnLen = zipBuf.readUInt16LE(localOffset + 26);
        const lhExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataOffset = localOffset + 30 + lhFnLen + lhExtraLen;
        const compMethod = zipBuf.readUInt16LE(localOffset + 8);
        const compSize = zipBuf.readUInt32LE(localOffset + 18);
        const compData = zipBuf.slice(dataOffset, dataOffset + compSize);

        let fileData;
        if (compMethod === 0) {
            fileData = compData;
        } else if (compMethod === 8) {
            const { inflateRawSync } = await import("zlib");
            fileData = inflateRawSync(compData);
        } else {
            throw new Error(`Unsupported ZIP compression method: ${compMethod}`);
        }

        const outPath = path.join(destDir, ...relName.split("/"));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, fileData);
    }
}

/**
 * Downloads the GitHub source ZIP for owner/repo and extracts into destDir,
 * stripping the single top-level GitHub wrapper directory automatically.
 */
export async function downloadSourceZip(owner, repo, destDir) {
    for (const branch of ["main", "master", "HEAD"]) {
        let r;
        try {
            r = await httpsGet(
                `https://api.github.com/repos/${owner}/${repo}/zipball/${branch}`,
                {},
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
