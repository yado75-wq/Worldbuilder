import { App, TAbstractFile, TFile, TFolder, getAllTags } from 'obsidian';
import { MenuContext, WorldInfo, TemplateSetInfo } from '../types';

export function resolveContext(
	app: App,
	file: TAbstractFile,
	worlds: WorldInfo[],
	templateSets: TemplateSetInfo[],
	templatesRootPath: string
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

		// Entity file — identified by its own tag, not by which folder it
		// sits in (a file already knows what it is; the folder it happens
		// to be in shouldn't gate whether it's editable).
		const entityFileMatch = findEntityFile(app, file, worlds, templateSets);
		if (entityFileMatch) return entityFileMatch;

		return { type: 'unknown' };
	}

	// ── Folder contexts ───────────────────────────────────────────────────
	if (file instanceof TFolder) {

		// Template set folder — direct child of templates root
		const templateSet = findTemplateSet(file, templateSets, templatesRootPath);
		if (templateSet) return { type: 'template-set', templateSet };

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

function findTemplateSet(
	folder: TFolder,
	templateSets: TemplateSetInfo[],
	templatesRootPath: string
): TemplateSetInfo | null {
	// Template set folder must be a direct child of the templates root
	if (folder.parent?.path !== templatesRootPath) return null;
	return templateSets.find(ts => ts.path === folder.path) ?? null;
}

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

/**
 * Identifies an entity file by its own tag, matched against the world's
 * template set's field sets — not by which folder it happens to sit in.
 * A file tagged e.g. `event` is an Event regardless of whether it's inside
 * the folder folder-rules.md maps to Event, a folder that only matches the
 * `*` wildcard catch-all, or the world root itself. `generic` is excluded
 * explicitly — a generic entity has nothing structured worth editing
 * through this command.
 */
function findEntityFile(
	app: App,
	file: TFile,
	worlds: WorldInfo[],
	templateSets: TemplateSetInfo[]
): MenuContext | null {
	const world = worlds.find(w => file.path.startsWith(w.path + '/'));
	if (!world) return null;

	const templateSet = templateSets.find(ts => ts.name === world.templateSet) ?? templateSets[0];
	if (!templateSet) return null;

	const rawTags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
	const fileTags = new Set(rawTags.map(t => t.replace(/^#/, '').toLowerCase()));

	for (const entityType of Object.keys(templateSet.fieldSets)) {
		if (entityType.toLowerCase() === 'generic') continue;
		if (fileTags.has(entityType.toLowerCase())) {
			return { type: 'entity-file', world, entityType, file };
		}
	}

	return null;
}
