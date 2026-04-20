import fs from "fs";
import path from "path";
import { getPaths } from "../../config.js";

const { addonsDirectory } = getPaths();

export { addonsDirectory };

// ── Release tag (written during install, used for update checks) ──

export function getLocalReleaseTag(addonName) {
    try {
        const raw =
            fs
                .readdirSync(addonsDirectory)
                .find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() ===
                        addonName.toLowerCase(),
                ) || addonName;
        const tagFile = path.join(addonsDirectory, raw, ".git-release");
        if (fs.existsSync(tagFile))
            return fs.readFileSync(tagFile, "utf8").trim();
        return null;
    } catch {
        return null;
    }
}

export function getLocalCommitHash(addonName) {
    try {
        const raw =
            fs
                .readdirSync(addonsDirectory)
                .find(
                    (n) =>
                        n.replace(/^!/, "").toLowerCase() ===
                        addonName.toLowerCase(),
                ) || addonName;
        const headFile = path.join(addonsDirectory, raw, ".git", "HEAD");
        if (!fs.existsSync(headFile)) {
            const commitFile = path.join(addonsDirectory, raw, ".git-commit");
            if (fs.existsSync(commitFile))
                return fs.readFileSync(commitFile, "utf8").trim();
            return null;
        }
        const head = fs.readFileSync(headFile, "utf8").trim();
        if (!head.startsWith("ref:")) return head.length >= 40 ? head : null;
        const refPath = head.slice(5).trim();
        const refFile = path.join(
            addonsDirectory,
            raw,
            ".git",
            ...refPath.split("/"),
        );
        if (fs.existsSync(refFile))
            return fs.readFileSync(refFile, "utf8").trim();
        const packedRefs = path.join(
            addonsDirectory,
            raw,
            ".git",
            "packed-refs",
        );
        if (fs.existsSync(packedRefs)) {
            const lines = fs.readFileSync(packedRefs, "utf8").split("\n");
            for (const line of lines) {
                if (line.endsWith(refPath)) return line.split(" ")[0].trim();
            }
        }
        return null;
    } catch {
        return null;
    }
}

// ── Installed entries ──

export function installedEntries() {
    try {
        return fs.readdirSync(addonsDirectory).map((n) => ({
            name: n.replace(/^!/, "").toLowerCase(),
            enabled: !n.startsWith("!"),
        }));
    } catch {
        return [];
    }
}

export function findEntry(name) {
    const needle = name.toLowerCase();
    return (
        fs
            .readdirSync(addonsDirectory)
            .find((n) => n.replace(/^!/, "").toLowerCase() === needle) || null
    );
}

export function fsToggle(name) {
    const found = findEntry(name);
    if (!found) throw new Error("Not found: " + name);
    const disabled = found.startsWith("!");
    fs.renameSync(
        path.join(addonsDirectory, found),
        path.join(addonsDirectory, disabled ? found.slice(1) : "!" + found),
    );
    return !disabled;
}

export function fsDelete(name) {
    const found = findEntry(name);
    if (found)
        fs.rmSync(path.join(addonsDirectory, found), {
            recursive: true,
            force: true,
        });
}

// ── Custom (locally installed, not from store) entries ──

export function getCustomEntries(knownNames) {
    try {
        const knownSet = new Set(knownNames.map((n) => n.toLowerCase()));
        return fs
            .readdirSync(addonsDirectory)
            .filter((n) => !knownSet.has(n.replace(/^!/, "").toLowerCase()))
            .map((n) => {
                const clean = n.replace(/^!/, "");
                const enabled = !n.startsWith("!");
                const fullPath = path.join(addonsDirectory, n);
                const isDir = fs.statSync(fullPath).isDirectory();
                let logo = null,
                    readme = null;

                if (isDir) {
                    const files = fs.readdirSync(fullPath);
                    const isImgFile = (f) =>
                        /\.(png|jpe?g|gif|webp|svg)$/i.test(f);

                    function pickImgFile(list) {
                        return (
                            list.find(
                                (f) =>
                                    /^(image|icon|logo|preview)\./i.test(f) &&
                                    isImgFile(f),
                            ) ||
                            list.find((f) => isImgFile(f)) ||
                            null
                        );
                    }

                    function findBrandingDir(dirPath, depth = 0) {
                        if (depth > 3) return null;
                        try {
                            const items = fs.readdirSync(dirPath);
                            const found = items.find((item) => {
                                try {
                                    return (
                                        /^branding$/i.test(item) &&
                                        fs
                                            .statSync(path.join(dirPath, item))
                                            .isDirectory()
                                    );
                                } catch {
                                    return false;
                                }
                            });
                            if (found) return path.join(dirPath, found);
                            for (const item of items) {
                                try {
                                    const itemPath = path.join(dirPath, item);
                                    if (fs.statSync(itemPath).isDirectory()) {
                                        const r = findBrandingDir(
                                            itemPath,
                                            depth + 1,
                                        );
                                        if (r) return r;
                                    }
                                } catch {
                                    /* skip */
                                }
                            }
                        } catch {
                            /* skip */
                        }
                        return null;
                    }

                    function findLogoInDir(dirPath, depth = 0) {
                        if (depth > 5) return null;
                        try {
                            const items = fs.readdirSync(dirPath);
                            const img = pickImgFile(items);
                            if (img) return path.join(dirPath, img);
                            for (const item of items) {
                                try {
                                    const itemPath = path.join(dirPath, item);
                                    if (fs.statSync(itemPath).isDirectory()) {
                                        const r = findLogoInDir(
                                            itemPath,
                                            depth + 1,
                                        );
                                        if (r) return r;
                                    }
                                } catch {
                                    /* skip */
                                }
                            }
                        } catch {
                            /* skip */
                        }
                        return null;
                    }

                    // 1. Root-level image
                    const rootImg = pickImgFile(files);
                    if (rootImg)
                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rootImg)}`;

                    // 2. Branding folder (recursive search within it)
                    if (!logo) {
                        const brandingPath = findBrandingDir(fullPath);
                        if (brandingPath) {
                            const logoAbs = findLogoInDir(brandingPath);
                            if (logoAbs)
                                logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.relative(fullPath, logoAbs))}`;
                        }
                    }

                    // 3. One level deep in dirs that contain scripts
                    if (!logo) {
                        for (const sub of files) {
                            try {
                                const subPath = path.join(fullPath, sub);
                                if (!fs.statSync(subPath).isDirectory())
                                    continue;
                                const subFiles = fs.readdirSync(subPath);
                                if (
                                    subFiles.some((f) =>
                                        /\.(css|js|json)$/i.test(f),
                                    )
                                ) {
                                    const found = pickImgFile(subFiles);
                                    if (found) {
                                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.join(sub, found))}`;
                                        break;
                                    }
                                }
                            } catch {
                                /* skip */
                            }
                        }
                    }

                    const rmFile = files.find((f) => /^readme\.md$/i.test(f));
                    if (rmFile)
                        readme = `nextstore://app/api/local-readme?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rmFile)}`;
                }

                return { name: clean, raw: n, enabled, isDir, logo, readme };
            });
    } catch {
        return [];
    }
}
