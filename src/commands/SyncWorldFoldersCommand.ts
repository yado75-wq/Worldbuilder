import { App, Notice, TFolder } from 'obsidian';
import { PluginState } from '../types/runtime';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';
import { t } from '../i18n';

export type SyncWorldFoldersResult =
	| {
			ok: true;
			created: string[];
			deleted: string[];
			kept: string[];
	  }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'world-folder-not-found'
				| 'empty-world-template';
			detail?: string;
	  };

function err(
	code: Extract<SyncWorldFoldersResult, { ok: false }>['code'],
	detail?: string
): SyncWorldFoldersResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function syncWorldFolders(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<SyncWorldFoldersResult> {
	if (hasActiveWorldConflict(state)) {
		new Notice(t('notice.active-world-conflict'));
		return err('active-world-conflict');
	}

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice(t('notice.world-not-found'));
		return err('world-not-found');
	}

	const resolved = resolveTemplateSetByName(state.templateSets, world.templateSet);
	if (!resolved.ok) {
		new Notice(missingTemplateSetMessage(resolved));
		return err(
			resolved.reason === 'none' ? 'no-template-sets' : 'missing-template-set',
			resolved.reason === 'missing' ? resolved.requested : undefined
		);
	}
	const templateSet = resolved.set;

	const created: string[] = [];
	const kept: string[] = [];
	const deleted: string[] = [];

	const worldFolder = app.vault.getAbstractFileByPath(worldPath);
	if (!(worldFolder instanceof TFolder)) {
		new Notice(t('notice.world-folder-not-found'));
		return err('world-folder-not-found');
	}

	if (templateSet.worldTemplate.length === 0) {
		new Notice(t('notice.empty-world-template'));
		return err('empty-world-template');
	}

	for (const sub of templateSet.worldTemplate) {
		const folderPath = `${worldPath}/${sub}`;
		if (app.vault.getAbstractFileByPath(folderPath)) {
			kept.push(sub);
		} else {
			await app.vault.createFolder(folderPath);
			created.push(sub);
		}
	}

	for (const child of worldFolder.children) {
		if (!(child instanceof TFolder)) continue;
		if (templateSet.worldTemplate.includes(child.name)) continue;
		if (child.children.length > 0) continue;

		await app.fileManager.trashFile(child);
		deleted.push(child.name);
	}

	const parts: string[] = [];
	if (created.length > 0) {
		parts.push(t('notice.folders-created', { names: created.join(', ') }));
	}
	if (deleted.length > 0) {
		parts.push(t('notice.folders-removed-empty', { names: deleted.join(', ') }));
	}
	if (kept.length > 0) {
		parts.push(t('notice.folders-kept', { names: kept.join(', ') }));
	}
	if (parts.length === 0) {
		parts.push(t('notice.folders-no-changes'));
	}
	new Notice(parts.join('\n'));

	return { ok: true, created, deleted, kept };
}