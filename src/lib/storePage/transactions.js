import fs from "fs";
import path from "path";

function exists(file) {
	try {
		fs.lstatSync(file);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

export function preserveLocalFiles(source, target, root = true) {
	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		if (root && [".git-release", ".git-commit"].includes(entry.name)) continue;
		const from = path.join(source, entry.name);
		const to = path.join(target, entry.name);
		if (!exists(to)) {
			fs.cpSync(from, to, {
				recursive: true,
				dereference: false,
				verbatimSymlinks: true,
				errorOnExist: true,
				force: false,
			});
		} else if (entry.isDirectory() && fs.lstatSync(to).isDirectory()) {
			preserveLocalFiles(from, to, false);
		}
	}
}

export function recoverTransactions(root, validName) {
	if (!exists(root)) return;
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.startsWith(".store-backup-"))
			continue;
		const backup = path.join(root, entry.name);
		const old = path.join(backup, "addon");
		try {
			if (exists(path.join(backup, "completed"))) continue;
			if (!fs.lstatSync(old).isDirectory()) continue;
			const manifest = path.join(backup, "target.json");
			if (!fs.lstatSync(manifest).isFile()) continue;
			const name = JSON.parse(fs.readFileSync(manifest, "utf8"));
			if (typeof name !== "string" || !validName(name.replace(/^!/, "")))
				continue;
			const dest = path.join(root, name);
			const collision = fs
				.readdirSync(root)
				.some(
					(item) =>
						!item.startsWith(".") &&
						item.replace(/^!/, "").toLowerCase() ===
							name.replace(/^!/, "").toLowerCase(),
				);
			if (!exists(dest) && !collision) {
				fs.renameSync(old, dest);
				fs.rmSync(backup, { recursive: true, force: true });
			} else if (exists(dest)) {
				fs.writeFileSync(path.join(backup, "completed"), "", { flag: "wx" });
			} else {
				console.error("[Store] Recovery blocked by another addon:", name);
			}
		} catch (error) {
			if (error.code !== "ENOENT")
				console.error("[Store] Recovery failed:", error.message);
		}
	}
}

export function commitAddon(root, stage, dest, expected) {
	if (expected) {
		const current = fs.lstatSync(dest);
		if (
			!current.isDirectory() ||
			current.dev !== expected.dev ||
			current.ino !== expected.ino
		)
			throw new Error("Addon changed during download");
	} else if (exists(dest)) {
		throw new Error("Addon appeared during download");
	}
	if (!expected) {
		fs.renameSync(stage, dest);
		return;
	}
	const backup = fs.mkdtempSync(path.join(root, ".store-backup-"));
	const old = path.join(backup, "addon");
	try {
		fs.writeFileSync(
			path.join(backup, "target.json"),
			JSON.stringify(path.basename(dest)),
			{ flag: "wx" },
		);
		fs.renameSync(dest, old);
		try {
			fs.renameSync(stage, dest);
		} catch (error) {
			try {
				fs.renameSync(old, dest);
			} catch (restoreError) {
				throw new Error(
					`Update failed: ${error.message}; restore failed: ${restoreError.message}. Backup: ${backup}`,
				);
			}
			throw error;
		}
		try {
			fs.writeFileSync(path.join(backup, "completed"), "", { flag: "wx" });
		} catch (error) {
			console.error("[Store] Could not mark backup completed:", error.message);
		}
	} catch (error) {
		if (!exists(old)) fs.rmSync(backup, { recursive: true, force: true });
		throw error;
	}
}
