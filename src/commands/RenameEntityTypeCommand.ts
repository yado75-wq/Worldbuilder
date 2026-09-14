import { App, Notice, TFile, TFolder } from 'obsidian';
import { PluginState } from '../types/runtime';
import { hasLeadingUnderscore } from '../util/names';
import {
	fieldsFileName,
	isReservedEntityType,
	retagNoteFrontmatter,
	rewriteFieldsFileContent,
	rewriteFolderRulesContent,
} from '../util/entityTypeRewrite';
import { worldsUsingTemplateSet } from '../state/templateSetAudit';
import { t } from '../i18n';

export type RenameEntityTypeResult =
	| {
			ok: true;
			oldType: string;
			newType: string;
			notesRetagged: number;
			fieldFilesTouched: number;
			rulesTouched: number;
	  }
	| {
			ok: false;
			code:
				| 'set-not-found'
				| 'old-not-found'
				| 'new-exists'
				| 'reserved-type'
				| 'leading-underscore'
				| 'cancelled'
				| 'invalid-name'
				| 'folder-missing';
	  };

export interface RenameEntityTypeImpact {
	rulesLines: number;
	fieldTokenFiles: number;
	notesEstimate: number;
	worldCount: number;
}

/**
 * Dry-run counts for confirm dialog (best-effort; notes counted by tag scan).
 */
export async function previewRenameEntityType(
	app: App,
	state: PluginState,
	setName: string,
	oldType: string,
	newType: string
): Promise<
	| { ok: true; impact: RenameEntityTypeImpact }
	| { ok: false; code: Extract<RenameEntityTypeResult, { ok: false }>['code'] }
> {
	const gate = validateRenameInputs(state, setName, oldType, newType);
	if (!gate.ok) return gate;

	const set = state.templateSets.find(s => s.name === setName)!;
	const folder = app.vault.getAbstractFileByPath(set.path);
	if (!(folder instanceof TFolder)) {
		return { ok: false, code: 'folder-missing' };
	}

	let rulesLines = 0;
	let fieldTokenFiles = 0;

	const rulesFile = app.vault.getAbstractFileByPath(`${set.path}/folder-rules.md`);
	if (rulesFile instanceof TFile) {
		const raw = await app.vault.read(rulesFile);
		rulesLines = rewriteFolderRulesContent(raw, oldType, newType).replacements;
	}

	for (const child of folder.children) {
		if (!(child instanceof TFile)) continue;
		if (!child.name.endsWith('_Fields.md')) continue;
		const raw = await app.vault.read(child);
		const { replacements } = rewriteFieldsFileContent(raw, oldType, newType);
		if (replacements > 0) fieldTokenFiles += 1;
	}

	const bound = worldsUsingTemplateSet(state.worlds, setName);
	const oldTag = oldType.toLowerCase();
	let notesEstimate = 0;
	for (const world of bound) {
		const prefix = world.path.endsWith('/') ? world.path : `${world.path}/`;
		for (const file of app.vault.getFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			if (file.extension !== 'md') continue;
			const content = await app.vault.read(file);
			if (retagNoteFrontmatter(content, oldTag, newType.toLowerCase()).changed) {
				notesEstimate += 1;
			}
		}
	}

	return {
		ok: true,
		impact: {
			rulesLines,
			fieldTokenFiles,
			notesEstimate,
			worldCount: bound.length,
		},
	};
}

function validateRenameInputs(
	state: PluginState,
	setName: string,
	oldType: string,
	newType: string
): { ok: true } | { ok: false; code: Extract<RenameEntityTypeResult, { ok: false }>['code'] } {
	const set = state.templateSets.find(s => s.name === setName);
	if (!set) return { ok: false, code: 'set-not-found' };

	const oldTrim = oldType.trim();
	const newTrim = newType.trim();
	if (!oldTrim || !newTrim) return { ok: false, code: 'invalid-name' };
	if (hasLeadingUnderscore(newTrim)) return { ok: false, code: 'leading-underscore' };
	if (isReservedEntityType(oldTrim) || isReservedEntityType(newTrim)) {
		return { ok: false, code: 'reserved-type' };
	}

	if (!(oldTrim in set.fieldSets)) {
		// case-insensitive fallback
		const key = Object.keys(set.fieldSets).find(
			k => k.toLowerCase() === oldTrim.toLowerCase()
		);
		if (!key) return { ok: false, code: 'old-not-found' };
	}

	if (newTrim in set.fieldSets) return { ok: false, code: 'new-exists' };
	const clash = Object.keys(set.fieldSets).find(
		k => k.toLowerCase() === newTrim.toLowerCase()
	);
	if (clash) return { ok: false, code: 'new-exists' };

	return { ok: true };
}

/**
 * Rename entity type within one template set: field tokens, folder-rules,
 * fields file rename, retag notes in bound worlds.
 */
export async function renameEntityType(
	app: App,
	state: PluginState,
	setName: string,
	oldType: string,
	newType: string,
	confirm: (impact: RenameEntityTypeImpact) => Promise<boolean>
): Promise<RenameEntityTypeResult> {
	const oldTrim = oldType.trim();
	const newTrim = newType.trim();

	const gate = validateRenameInputs(state, setName, oldTrim, newTrim);
	if (!gate.ok) {
		noticeForCode(gate.code, oldTrim, newTrim, setName);
		return gate;
	}

	const set = state.templateSets.find(s => s.name === setName)!;
	const oldKey =
		Object.keys(set.fieldSets).find(k => k.toLowerCase() === oldTrim.toLowerCase()) ??
		oldTrim;

	const preview = await previewRenameEntityType(app, state, setName, oldKey, newTrim);
	if (!preview.ok) {
		noticeForCode(preview.code, oldKey, newTrim, setName);
		return preview;
	}

	const ok = await confirm(preview.impact);
	if (!ok) return { ok: false, code: 'cancelled' };

	const folder = app.vault.getAbstractFileByPath(set.path);
	if (!(folder instanceof TFolder)) {
		return { ok: false, code: 'folder-missing' };
	}

	let fieldFilesTouched = 0;
	let rulesTouched = 0;

	// 1) Rewrite link tokens in all field files
	for (const child of folder.children) {
		if (!(child instanceof TFile)) continue;
		if (!child.name.endsWith('_Fields.md')) continue;
		const raw = await app.vault.read(child);
		const { content, replacements } = rewriteFieldsFileContent(raw, oldKey, newTrim);
		if (replacements > 0) {
			await app.vault.modify(child, content);
			fieldFilesTouched += 1;
		}
	}

	// 2) folder-rules entity column
	const rulesPath = `${set.path}/folder-rules.md`;
	const rulesFile = app.vault.getAbstractFileByPath(rulesPath);
	if (rulesFile instanceof TFile) {
		const raw = await app.vault.read(rulesFile);
		const { content, replacements } = rewriteFolderRulesContent(raw, oldKey, newTrim);
		if (replacements > 0) {
			await app.vault.modify(rulesFile, content);
			rulesTouched = replacements;
		}
	}

	// 3) Rename Type_Fields.md
	const oldPath = `${set.path}/${fieldsFileName(oldKey)}`;
	const newPath = `${set.path}/${fieldsFileName(newTrim)}`;
	const oldFile = app.vault.getAbstractFileByPath(oldPath);
	if (!(oldFile instanceof TFile)) {
		new Notice(t('notice.rename-entity-old-missing', { type: oldKey }));
		return { ok: false, code: 'old-not-found' };
	}
	if (app.vault.getAbstractFileByPath(newPath)) {
		new Notice(t('notice.rename-entity-new-exists', { type: newTrim }));
		return { ok: false, code: 'new-exists' };
	}
	await app.vault.rename(oldFile, newPath);

	// 4) Retag notes in bound worlds
	const oldTag = oldKey.toLowerCase();
	const newTag = newTrim.toLowerCase();
	let notesRetagged = 0;
	const bound = worldsUsingTemplateSet(state.worlds, setName);
	for (const world of bound) {
		const prefix = world.path.endsWith('/') ? world.path : `${world.path}/`;
		for (const file of app.vault.getFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			if (file.extension !== 'md') continue;
			if (file.basename.startsWith('_')) continue;
			const raw = await app.vault.read(file);
			const { content, changed } = retagNoteFrontmatter(raw, oldTag, newTag);
			if (changed) {
				await app.vault.modify(file, content);
				notesRetagged += 1;
			}
		}
	}

	new Notice(
		t('notice.rename-entity-done', {
			old: oldKey,
			new: newTrim,
			notes: String(notesRetagged),
		})
	);

	return {
		ok: true,
		oldType: oldKey,
		newType: newTrim,
		notesRetagged,
		fieldFilesTouched,
		rulesTouched,
	};
}

function noticeForCode(
	code: Extract<RenameEntityTypeResult, { ok: false }>['code'],
	oldType: string,
	newType: string,
	setName: string
): void {
	switch (code) {
		case 'set-not-found':
			new Notice(t('notice.template-set-not-found', { name: setName }));
			break;
		case 'old-not-found':
			new Notice(t('notice.rename-entity-old-missing', { type: oldType }));
			break;
		case 'new-exists':
			new Notice(t('notice.rename-entity-new-exists', { type: newType }));
			break;
		case 'reserved-type':
			new Notice(t('notice.rename-entity-reserved'));
			break;
		case 'leading-underscore':
			new Notice(t('notice.leading-underscore'));
			break;
		case 'invalid-name':
			new Notice(t('notice.name-required'));
			break;
		case 'folder-missing':
			new Notice(t('notice.template-set-not-found', { name: setName }));
			break;
		case 'cancelled':
			break;
	}
}

/** Types available to rename in a set (excludes WorldMeta). */
export function listRenamableEntityTypes(fieldSets: Record<string, unknown>): string[] {
	return Object.keys(fieldSets)
		.filter(k => !isReservedEntityType(k))
		.sort((a, b) => a.localeCompare(b));
}
