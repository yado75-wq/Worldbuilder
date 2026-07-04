import { TAbstractFile, TFile, TFolder } from 'obsidian';
import { MenuContext, WorldInfo } from '../types';

export function resolveContext(
	file: TAbstractFile,
	worlds: WorldInfo[]
): MenuContext {

	// ── Vault root ────────────────────────────────────────────────────────
	if (file instanceof TFolder && file.path === '/') {
		return { type: 'vault-root' };
	}

	// ── File contexts ─────────────────────────────────────────────────────
	if (file instanceof TFile) {

		// _index.md — world index file
		if (file.name === '_index.md') {
			const world = findWorldByIndexFile(file, worlds);
			if (world) return { type: 'index-file', world };
		}

		// Entity file — lives one level inside a known entity folder
		const entityFileMatch = findEntityFile(file, worlds);
		if (entityFileMatch) return entityFileMatch;

		return { type: 'unknown' };
	}

	// ── Folder contexts ───────────────────────────────────────────────────
	if (file instanceof TFolder) {

		// World root folder
		const worldRoot = findWorldByFolder(file, worlds);
		if (worldRoot) return { type: 'world-root', world: worldRoot };

		// Entity folder — direct child of world root matching a folder rule
		const entityFolderMatch = findEntityFolder(file, worlds);
		if (entityFolderMatch) return entityFolderMatch;

		// Generic folder — inside a world but not a known entity folder
		const parentWorld = findParentWorld(file, worlds);
		if (parentWorld) return { type: 'generic-folder', world: parentWorld, folder: file };
	}

	return { type: 'unknown' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findWorldByIndexFile(file: TFile, worlds: WorldInfo[]): WorldInfo | null {
	return worlds.find(w => w.indexFile.path === file.path) ?? null;
}

function findWorldByFolder(folder: TFolder, worlds: WorldInfo[]): WorldInfo | null {
	return worlds.find(w => w.path === folder.path) ?? null;
}

function findParentWorld(folder: TFolder, worlds: WorldInfo[]): WorldInfo | null {
	return worlds.find(w => folder.path.startsWith(w.path + '/')) ?? null;
}

function findEntityFolder(
	folder: TFolder,
	worlds: WorldInfo[]
): MenuContext | null {
	for (const world of worlds) {
		// Must be a direct child of the world root
		if (folder.parent?.path !== world.path) continue;

		const rule = world.folderRules.find(r => r.targetFolder === folder.name);
		if (rule) {
			return {
				type: 'entity-folder',
				world,
				entityType: rule.entityType,
				folder,
			};
		}
	}
	return null;
}

function findEntityFile(
	file: TFile,
	worlds: WorldInfo[]
): MenuContext | null {
	for (const world of worlds) {
		if (!file.path.startsWith(world.path + '/')) continue;

		const parentFolder = file.parent;
		if (!parentFolder) continue;

		// Entity files are exactly one level inside the world root
		if (parentFolder.parent?.path !== world.path) continue;

		const rule = world.folderRules.find(
			r => r.targetFolder === parentFolder.name
		);

		if (rule) {
			return {
				type: 'entity-file',
				world,
				entityType: rule.entityType,
				file,
			};
		}
	}
	return null;
}
