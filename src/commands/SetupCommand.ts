import { App, Notice, normalizePath, TAbstractFile, TFile, TFolder } from 'obsidian';
import { TemplateSetInfo } from '../types/templateSet';
import { WorldBuilderSettings } from '../types/runtime';
import { t } from '../i18n';

const DEFAULT_FILES = [
	'world-template.md',
	'folder-rules.md',
	'WorldMeta_Fields.md',
	'Generic_Fields.md',
	'Character_Fields.md',
	'Location_Fields.md',
	'Faction_Fields.md',
];

export type EnsureDefaultTemplatesResult =
	| { ok: true; defaultSetName: string }
	| { ok: false; code: 'failed'; detail?: string };

export type CloneTemplateSetResult =
	| { ok: true; name: string }
	| {
			ok: false;
			code: 'source-not-found' | 'already-exists';
			detail?: string;
	  };

export type ResetTemplateSetResult =
	| { ok: true; name: string }
	| { ok: false; code: 'failed'; detail?: string };

function errClone(
	code: Extract<CloneTemplateSetResult, { ok: false }>['code'],
	detail?: string
): CloneTemplateSetResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function ensureDefaultTemplates(
	app: App,
	settings: WorldBuilderSettings,
	pluginDir: string,
	existingSets: TemplateSetInfo[]
): Promise<EnsureDefaultTemplatesResult> {
	const templatesRoot = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}`
	);
	const defaultsPath = normalizePath(`${templatesRoot}/defaults`);

	await ensureFolder(app, settings.systemFolder);
	await ensureFolder(app, templatesRoot);
	await ensureFolder(app, defaultsPath);

	const failed: string[] = [];
	for (const filename of DEFAULT_FILES) {
		const sourcePath = normalizePath(`${pluginDir}/defaults/${filename}`);
		const targetPath = normalizePath(`${defaultsPath}/${filename}`);

		if (app.vault.getAbstractFileByPath(targetPath)) continue;

		try {
			const content = await app.vault.adapter.read(sourcePath);
			await app.vault.create(targetPath, content);
		} catch {
			failed.push(filename);
			new Notice(t('notice.default-file-copy-failed', { filename }));
		}
	}
	if (failed.length > 0) {
		return {
			ok: false,
			code: 'failed',
			detail: failed.join(', '),
		};
	}

	const otherSets = existingSets.filter(s => s.name !== 'defaults');
	const defaultSetName =
		otherSets.length === 0 ? 'defaults' : (otherSets[0]?.name ?? 'defaults');

	return { ok: true, defaultSetName };
}

export async function cloneTemplateSet(
	app: App,
	settings: WorldBuilderSettings,
	sourceSetName: string,
	newSetName: string
): Promise<CloneTemplateSetResult> {
	const templatesRoot = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}`
	);
	const sourcePath = normalizePath(`${templatesRoot}/${sourceSetName}`);
	const targetPath = normalizePath(`${templatesRoot}/${newSetName}`);

	const sourceFolder = app.vault.getAbstractFileByPath(sourcePath);
	if (!(sourceFolder instanceof TFolder)) {
		new Notice(t('notice.template-set-not-found', { name: sourceSetName }));
		return errClone('source-not-found', sourceSetName);
	}

	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(t('notice.template-set-already-exists', { name: newSetName }));
		return errClone('already-exists', newSetName);
	}

	await ensureFolder(app, targetPath);
	for (const child of sourceFolder.children) {
		await copyTemplateNode(app, child, targetPath);
	}

	new Notice(t('notice.template-set-cloned', { name: newSetName, source: sourceSetName }));
	return { ok: true, name: newSetName };
}

export async function resetTemplateSet(
	app: App,
	settings: WorldBuilderSettings,
	pluginDir: string,
	setName: string
): Promise<ResetTemplateSetResult> {
	const setPath = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}/${setName}`
	);
	await ensureFolder(app, setPath);

	const failed: string[] = [];
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
			failed.push(filename);
			new Notice(t('notice.template-file-copy-failed', { filename, set: setName }));
		}
	}

	if (failed.length > 0) {
		return {
			ok: false,
			code: 'failed',
			detail: failed.join(', '),
		};
	}

	new Notice(t('notice.template-set-reset', { name: setName }));
	return { ok: true, name: setName };
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
