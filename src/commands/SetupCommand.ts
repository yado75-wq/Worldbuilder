import { App, Notice, normalizePath, TFolder } from 'obsidian';
import { WorldBuilderSettings, TemplateSetInfo } from '../types';

const DEFAULT_FILES = [
	'world-template.md',
	'folder-rules.md',
	'WorldMeta_Fields.md',
	'Generic_Fields.md',
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

	// Ensure folder structure exists
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

	// If no other sets exist, use defaults as working set
	const otherSets = existingSets.filter(s => s.name !== 'defaults');
	if (otherSets.length === 0) return 'defaults';

	return otherSets[0]?.name ?? 'defaults';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFolder) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// Folder may have been created between check and create — safe to ignore
	}
}
