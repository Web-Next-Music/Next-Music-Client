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
        path.join(
            addonsDirectory,
            disabled ? found.slice(1) : "!" + found,
        ),
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
                let logo = null, readme = null;

                if (isDir) {
                    const files = fs.readdirSync(fullPath);
                    const isImgFile = (f) =>
                        /\.(png|jpe?g|gif|webp|svg)$/i.test(f);

                    function pickImgFile(list) {
                        return (
                            list.find(
                                (f) => /^image\./i.test(f) && isImgFile(f),
                            ) ||
                            list.find(
                                (f) => /^icon\./i.test(f) && isImgFile(f),
                            ) ||
                            list.find((f) => isImgFile(f)) ||
                            null
                        );
                    }

                    let imgFile = pickImgFile(files);

                    if (!imgFile) {
                        const subdirs = files.filter((f) => {
                            try {
                                return fs
                                    .statSync(path.join(fullPath, f))
                                    .isDirectory();
                            } catch {
                                return false;
                            }
                        });
                        for (const sub of subdirs) {
                            const subPath = path.join(fullPath, sub);
                            try {
                                const subFiles = fs.readdirSync(subPath);
                                const hasScript = subFiles.some((f) =>
                                    /\.(css|js)$/i.test(f),
                                );
                                if (hasScript) {
                                    const found = pickImgFile(subFiles);
                                    if (found) {
                                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(path.join(sub, found))}`;
                                        break;
                                    }
                                }
                            } catch {
                                // skip
                            }
                        }
                    }

                    if (imgFile && !logo)
                        logo = `nextstore://app/api/local-logo?name=${encodeURIComponent(n)}&file=${encodeURIComponent(imgFile)}`;

                    const rmFile = files.find((f) =>
                        /^readme\.md$/i.test(f),
                    );
                    if (rmFile)
                        readme = `nextstore://app/api/local-readme?name=${encodeURIComponent(n)}&file=${encodeURIComponent(rmFile)}`;
                }

                return { name: clean, raw: n, enabled, isDir, logo, readme };
            });
    } catch {
        return [];
    }
}
