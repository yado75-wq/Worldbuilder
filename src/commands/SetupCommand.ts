import { App, Notice, normalizePath, TAbstractFile, TFile, TFolder } from 'obsidian';
import { WorldBuilderSettings, TemplateSetInfo } from '../types';

const DEFAULT_FILES = [
	'world-template.md',
	'folder-rules.md',
	'WorldMeta_Fields.md',
	'Generic_Fields.md',
	'Character_Fields.md',
	'Location_Fields.md',
	'Faction_Fields.md',
];

export async function ensureDefaultTemplates(
	app: App,
	settings: WorldBuilderSettings,
	pluginDir: string,
	existingSets: TemplateSetInfo[]
): Promise<string> {
	const templatesRoot = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}`
	);
	const defaultsPath = normalizePath(`${templatesRoot}/defaults`);

	await ensureFolder(app, settings.systemFolder);
	await ensureFolder(app, templatesRoot);
	await ensureFolder(app, defaultsPath);

	// Copy plugin defaults into _system/templates/defaults/
	for (const filename of DEFAULT_FILES) {
		const sourcePath = normalizePath(`${pluginDir}/defaults/${filename}`);
		const targetPath = normalizePath(`${defaultsPath}/${filename}`);

		if (app.vault.getAbstractFileByPath(targetPath)) continue;

		try {
			const content = await app.vault.adapter.read(sourcePath);
			await app.vault.create(targetPath, content);
		} catch {
			new Notice(`Warning: could not copy default file "${filename}".`);
		}
	}

	const otherSets = existingSets.filter(s => s.name !== 'defaults');
	if (otherSets.length === 0) return 'defaults';

	return otherSets[0]?.name ?? 'defaults';
}

export async function cloneTemplateSet(
	app: App,
	settings: WorldBuilderSettings,
	sourceSetName: string,
	newSetName: string
): Promise<boolean> {
	const templatesRoot = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}`
	);
	const sourcePath = normalizePath(`${templatesRoot}/${sourceSetName}`);
	const targetPath = normalizePath(`${templatesRoot}/${newSetName}`);

	const sourceFolder = app.vault.getAbstractFileByPath(sourcePath);
	if (!(sourceFolder instanceof TFolder)) {
		new Notice(`Template set "${sourceSetName}" not found.`);
		return false;
	}

	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`Template set "${newSetName}" already exists.`);
		return false;
	}

	await ensureFolder(app, targetPath);
	for (const child of sourceFolder.children) {
		await copyTemplateNode(app, child, targetPath);
	}

	new Notice(`Template set "${newSetName}" created from "${sourceSetName}".`);
	return true;
}

export async function resetTemplateSet(
	app: App,
	settings: WorldBuilderSettings,
	pluginDir: string,
	setName: string
): Promise<void> {
	const setPath = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}/${setName}`
	);
	await ensureFolder(app, setPath);

	for (const filename of DEFAULT_FILES) {
		const sourcePath = normalizePath(`${pluginDir}/defaults/${filename}`);
		const targetPath = normalizePath(`${setPath}/${filename}`);

		try {
			const content = await app.vault.adapter.read(sourcePath);
			const existing = app.vault.getAbstractFileByPath(targetPath);
			if (existing) {
				await app.vault.adapter.write(targetPath, content);
			} else {
				await app.vault.create(targetPath, content);
			}
		} catch {
			new Notice(`Warning: could not copy "${filename}" to "${setName}".`);
		}
	}

	new Notice(`Template set "${setName}" reset to plugin defaults.`);
}

async function copyTemplateNode(
	app: App,
	node: TAbstractFile,
	targetParentPath: string
): Promise<void> {
	const targetPath = normalizePath(`${targetParentPath}/${node.name}`);

	if (node instanceof TFolder) {
		await ensureFolder(app, targetPath);
		for (const child of node.children) {
			await copyTemplateNode(app, child, targetPath);
		}
		return;
	}

	if (node instanceof TFile) {
		await app.vault.adapter.copy(node.path, targetPath);
	}
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// Folder may have been created between check and create — safe to ignore
	}
}
