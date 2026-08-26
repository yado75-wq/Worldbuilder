import { App, TFile } from 'obsidian';
import { WorldInfo } from '../../types/world';

/** Folder name always wins over frontmatter `name:`. */
export function worldFolderName(world: WorldInfo): string {
	return world.folder.name;
}

/**
 * If `_index.md` display name does not match the folder name, rewrite
 * `name:` and the `#` heading. Returns true when a write happened.
 */
export async function syncWorldNameToFolder(app: App, world: WorldInfo): Promise<boolean> {
	const folderName = worldFolderName(world);
	const content = await app.vault.read(world.indexFile);
	const updated = replaceIndexDisplayName(content, folderName);

	if (updated === content) {
		// Already aligned
		const nameOk = new RegExp(`^name:\\s*"?${folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"?\\s*$`, 'm').test(content);
		return nameOk;
	}

	await app.vault.modify(world.indexFile, updated);
	return true;
}
/**
 * Set frontmatter `name:` and the first `#` heading to `worldName`.
 * Inserts `name:` into frontmatter if missing.
 */
export function replaceIndexDisplayName(content: string, worldName: string): string {
	let next = content;

	if (/^name:\s*.*$/m.test(next)) {
		next = next.replace(/^name:\s*.*$/m, `name: "${worldName}"`);
	} else if (/^---\s*\r?\n/.test(next)) {
		next = next.replace(/^---\s*\r?\n/, `---\nname: "${worldName}"\n`);
	}

	if (/^#\s+.+$/m.test(next)) {
		next = next.replace(/^#\s+.+$/m, `# ${worldName}`);
	} else {
		next = next.replace(
			/^(---\r?\n[\s\S]*?\r?\n---\s*\r?\n)/,
			`$1\n# ${worldName}\n`
		);
	}

	return next;
}

export async function readIndexOrEmpty(app: App, file: TFile): Promise<string> {
	return app.vault.read(file);
}