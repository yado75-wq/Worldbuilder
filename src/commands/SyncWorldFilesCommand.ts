import { App, Notice, TFile, TFolder, getAllTags } from 'obsidian';
import { FolderRule } from '../types/folderRule';
import { PluginState } from '../types';
import { ConfirmModal } from '../ui/ConfirmModal';
import { syncWorldNameToFolder } from './shared/WorldIndex';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';

interface MoveCandidate {
	file: TFile;
	currentFolder: string;
	targetFolder: string;
	reason: string;
}

export type SyncWorldFilesResult =
	| {
			ok: true;
			moved: string[];
			failed: string[];
			unrecognized: number;
			nameSynced: boolean;
	  }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'world-folder-not-found'
				| 'nothing-to-move'
				| 'cancelled';
			detail?: string;
	  };

function err(
	code: Extract<SyncWorldFilesResult, { ok: false }>['code'],
	detail?: string
): SyncWorldFilesResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function syncWorldFiles(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<SyncWorldFilesResult> {
	if (hasActiveWorldConflict(state)) {
		new Notice(
			'Active world conflict: open worldbuilder settings and use set as active (exactly one world must be active).'
		);
		return err('active-world-conflict');
	}

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
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

	const nameSynced = await syncWorldNameToFolder(app, world);
	if (nameSynced) {
		new Notice(`World display name set to folder name "${world.folder.name}".`);
	}

	const fixedRules = templateSet.folderRules.filter(r => r.targetFolder !== '*');

	const worldFolder = app.vault.getAbstractFileByPath(worldPath);
	if (!(worldFolder instanceof TFolder)) {
		new Notice('World folder not found.');
		return err('world-folder-not-found');
	}

	const candidates: MoveCandidate[] = [];
	const unrecognized: string[] = [];

	const worldFiles = app.vault.getFiles().filter(f =>
		f.path.startsWith(worldPath + '/') &&
		f.extension === 'md' &&
		!f.basename.startsWith('_')
	);

	for (const item of worldFiles) {
		const cache = app.metadataCache.getFileCache(item);
		const tags = getAllTags(cache ?? {}) ?? [];
		const normalizedTags = tags.map(t => t.replace('#', ''));

		if (normalizedTags.includes('generic')) continue;

		const matchingRule = findRuleByTag(fixedRules, normalizedTags);

		if (!matchingRule) {
			if (normalizedTags.length > 0) {
				unrecognized.push(item.path);
			}
			continue;
		}

		const targetFolderPath = `${worldPath}/${matchingRule.targetFolder}`;
		if (item.parent?.path === targetFolderPath) continue;

		candidates.push({
			file: item,
			currentFolder: item.parent?.name ?? '?',
			targetFolder: matchingRule.targetFolder,
			reason: `tag "${normalizedTags[0]}" → ${matchingRule.targetFolder}`,
		});
	}

	if (candidates.length === 0) {
		const msg = unrecognized.length > 0
			? `All files are in correct folders. ${unrecognized.length} unrecognized file(s) left in place.`
			: 'All files are in correct folders.';
		new Notice(msg);
		return err('nothing-to-move', unrecognized.length > 0 ? String(unrecognized.length) : undefined);
	}

	const preview = candidates
		.map(c => `• ${c.file.basename}: ${c.currentFolder} → ${c.targetFolder}`)
		.join('\n');

	const confirmed = await askConfirm(
		app,
		`Move ${candidates.length} file(s)?\n\n${preview}`,
		'Move files',
		'Cancel'
	);

	if (!confirmed) {
		return err('cancelled');
	}

	const moved: string[] = [];
	const failed: string[] = [];

	for (const candidate of candidates) {
		const targetPath = `${worldPath}/${candidate.targetFolder}/${candidate.file.name}`;

		const targetFolder = app.vault.getAbstractFileByPath(`${worldPath}/${candidate.targetFolder}`);
		if (!(targetFolder instanceof TFolder)) {
			failed.push(`${candidate.file.basename} (target folder missing)`);
			continue;
		}

		if (app.vault.getAbstractFileByPath(targetPath)) {
			failed.push(`${candidate.file.basename} (name conflict in target)`);
			continue;
		}

		try {
			await app.fileManager.renameFile(candidate.file, targetPath);
			moved.push(candidate.file.basename);
		} catch {
			failed.push(candidate.file.basename);
		}
	}

	const parts: string[] = [];
	if (moved.length > 0) parts.push(`Moved: ${moved.join(', ')}`);
	if (failed.length > 0) parts.push(`Failed: ${failed.join(', ')}`);
	if (unrecognized.length > 0) parts.push(`Unrecognized (left in place): ${unrecognized.length}`);
	new Notice(parts.join('\n'));

	return {
		ok: true,
		moved,
		failed,
		unrecognized: unrecognized.length,
		nameSynced,
	};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findRuleByTag(
	rules: FolderRule[],
	tags: string[]
): FolderRule | null {
	for (const tag of tags) {
		const rule = rules.find(r => r.entityType.toLowerCase() === tag.toLowerCase());
		if (rule) return rule;
	}
	return null;
}

function askConfirm(
	app: App,
	message: string,
	confirmLabel: string,
	cancelLabel: string
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, message, resolve, confirmLabel, cancelLabel, 'Sync world files');
		modal.open();
	});
}
