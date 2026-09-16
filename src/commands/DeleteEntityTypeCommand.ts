import { App, Notice, TFile, TFolder } from 'obsidian';
import { PluginState } from '../types/runtime';
import {
	fieldsFileName,
	fieldTypeSpecReferencesType,
	isReservedEntityType,
	removeFolderRulesEntityLine,
	removeTypeFromFieldsFileContent,
} from '../util/entityTypeRewrite';
import { worldsUsingTemplateSet } from '../state/templateSetAudit';
import { t } from '../i18n';

export type DeleteEntityTypeResult =
	| {
			ok: true;
			type: string;
			setName: string;
			instancesRemaining: number;
			removedFolderRule: boolean;
			cleanedLinkTokens: boolean;
	  }
	| {
			ok: false;
			code:
				| 'set-not-found'
				| 'type-not-found'
				| 'reserved-type'
				| 'cancelled'
				| 'folder-missing';
	  };

export interface DeleteEntityTypeImpact {
	instanceCount: number;
	hasFolderRule: boolean;
	inboundFieldFiles: number;
	/** Recommended defaults applied on confirm (no per-checkbox UI in v1). */
	willRemoveFolderRule: boolean;
	willCleanLinkTokens: boolean;
	genericDefaultsWarning: boolean;
	worldCount: number;
}

export function listDeletableEntityTypes(fieldSets: Record<string, unknown>): string[] {
	return Object.keys(fieldSets)
		.filter(k => !isReservedEntityType(k))
		.sort((a, b) => a.localeCompare(b));
}

function resolveTypeKey(
	fieldSets: Record<string, unknown>,
	typeName: string
): string | null {
	if (typeName in fieldSets) return typeName;
	return (
		Object.keys(fieldSets).find(k => k.toLowerCase() === typeName.toLowerCase()) ?? null
	);
}

function validateDeleteInputs(
	state: PluginState,
	setName: string,
	typeName: string
): { ok: true; typeKey: string } | { ok: false; code: Extract<DeleteEntityTypeResult, { ok: false }>['code'] } {
	const set = state.templateSets.find(s => s.name === setName);
	if (!set) return { ok: false, code: 'set-not-found' };
	const trimmed = typeName.trim();
	if (!trimmed) return { ok: false, code: 'type-not-found' };
	if (isReservedEntityType(trimmed)) return { ok: false, code: 'reserved-type' };
	const typeKey = resolveTypeKey(set.fieldSets, trimmed);
	if (!typeKey) return { ok: false, code: 'type-not-found' };
	return { ok: true, typeKey };
}

async function countInstances(
	app: App,
	state: PluginState,
	setName: string,
	typeKey: string
): Promise<{ count: number; worldCount: number }> {
	const bound = worldsUsingTemplateSet(state.worlds, setName);
	const tag = typeKey.toLowerCase();
	let count = 0;
	for (const world of bound) {
		const prefix = world.path.endsWith('/') ? world.path : `${world.path}/`;
		for (const file of app.vault.getFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			if (file.extension !== 'md') continue;
			if (file.basename.startsWith('_')) continue;
			if (file.name === '_index.md') continue;
			const content = await app.vault.read(file);
			const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			if (!fm?.[1]) continue;
			const body = fm[1];
			const listHit = new RegExp(`^[ \\t]*-[ \\t]*${escapeRe(tag)}[ \\t]*$`, 'im').test(
				body
			);
			const inlineHit = new RegExp(`tags:\\s*\\[[^\\]]*\\b${escapeRe(tag)}\\b`, 'i').test(
				body
			);
			if (listHit || inlineHit) count += 1;
		}
	}
	return { count, worldCount: bound.length };
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function previewDeleteEntityType(
	app: App,
	state: PluginState,
	setName: string,
	typeName: string
): Promise<
	| { ok: true; impact: DeleteEntityTypeImpact; typeKey: string }
	| { ok: false; code: Extract<DeleteEntityTypeResult, { ok: false }>['code'] }
> {
	const gate = validateDeleteInputs(state, setName, typeName);
	if (!gate.ok) return gate;

	const set = state.templateSets.find(s => s.name === setName)!;
	const folder = app.vault.getAbstractFileByPath(set.path);
	if (!(folder instanceof TFolder)) {
		return { ok: false, code: 'folder-missing' };
	}

	const typeKey = gate.typeKey;
	const { count: instanceCount, worldCount } = await countInstances(
		app,
		state,
		setName,
		typeKey
	);

	let hasFolderRule = false;
	const rulesFile = app.vault.getAbstractFileByPath(`${set.path}/folder-rules.md`);
	if (rulesFile instanceof TFile) {
		const raw = await app.vault.read(rulesFile);
		hasFolderRule = removeFolderRulesEntityLine(raw, typeKey).removals > 0;
	}

	let inboundFieldFiles = 0;
	for (const child of folder.children) {
		if (!(child instanceof TFile)) continue;
		if (!child.name.endsWith('_Fields.md')) continue;
		if (child.name === fieldsFileName(typeKey)) continue;
		const raw = await app.vault.read(child);
		const hit = raw.split(/\r?\n/).some(line => {
			const cleaned = line.replace(/^[-*]\s*/, '');
			const parts = cleaned.split('|');
			if (parts.length < 4) return false;
			return fieldTypeSpecReferencesType(parts[3] ?? '', typeKey);
		});
		if (hit) inboundFieldFiles += 1;
	}

	const fullCleanup = instanceCount === 0;
	return {
		ok: true,
		typeKey,
		impact: {
			instanceCount,
			hasFolderRule,
			inboundFieldFiles,
			willRemoveFolderRule: fullCleanup && hasFolderRule,
			willCleanLinkTokens: fullCleanup && inboundFieldFiles > 0,
			genericDefaultsWarning:
				typeKey.toLowerCase() === 'generic' && setName === 'defaults',
			worldCount,
		},
	};
}

/**
 * Delete entity type definition from a template set.
 * Does not strip tags or delete notes. Optional cleanups follow instance defaults.
 */
export async function deleteEntityType(
	app: App,
	state: PluginState,
	setName: string,
	typeName: string,
	confirm: (impact: DeleteEntityTypeImpact) => Promise<boolean>,
	options?: {
		/** Override defaults (tests / future checkbox UI). */
		removeFolderRule?: boolean;
		cleanLinkTokens?: boolean;
	}
): Promise<DeleteEntityTypeResult> {
	const preview = await previewDeleteEntityType(app, state, setName, typeName);
	if (!preview.ok) {
		noticeForCode(preview.code, typeName, setName);
		return preview;
	}

	const { impact, typeKey } = preview;
	const ok = await confirm(impact);
	if (!ok) return { ok: false, code: 'cancelled' };

	const removeRule =
		options?.removeFolderRule ?? impact.willRemoveFolderRule;
	const cleanTokens =
		options?.cleanLinkTokens ?? impact.willCleanLinkTokens;

	const set = state.templateSets.find(s => s.name === setName)!;
	const folder = app.vault.getAbstractFileByPath(set.path);
	if (!(folder instanceof TFolder)) {
		return { ok: false, code: 'folder-missing' };
	}

	const fieldsPath = `${set.path}/${fieldsFileName(typeKey)}`;
	const fieldsFile = app.vault.getAbstractFileByPath(fieldsPath);
	if (!(fieldsFile instanceof TFile)) {
		noticeForCode('type-not-found', typeKey, setName);
		return { ok: false, code: 'type-not-found' };
	}

	await app.fileManager.trashFile(fieldsFile);

	let removedFolderRule = false;
	if (removeRule) {
		const rulesPath = `${set.path}/folder-rules.md`;
		const rulesFile = app.vault.getAbstractFileByPath(rulesPath);
		if (rulesFile instanceof TFile) {
			const raw = await app.vault.read(rulesFile);
			const { content, removals } = removeFolderRulesEntityLine(raw, typeKey);
			if (removals > 0) {
				await app.vault.modify(rulesFile, content);
				removedFolderRule = true;
			}
		}
	}

	let cleanedLinkTokens = false;
	if (cleanTokens) {
		for (const child of folder.children) {
			if (!(child instanceof TFile)) continue;
			if (!child.name.endsWith('_Fields.md')) continue;
			if (child.name === fieldsFileName(typeKey)) continue;
			const raw = await app.vault.read(child);
			const { content, replacements } = removeTypeFromFieldsFileContent(raw, typeKey);
			if (replacements > 0) {
				await app.vault.modify(child, content);
				cleanedLinkTokens = true;
			}
		}
	}

	new Notice(
		t('notice.delete-entity-done', {
			type: typeKey,
			instances: String(impact.instanceCount),
		})
	);

	return {
		ok: true,
		type: typeKey,
		setName,
		instancesRemaining: impact.instanceCount,
		removedFolderRule,
		cleanedLinkTokens,
	};
}

function noticeForCode(
	code: Extract<DeleteEntityTypeResult, { ok: false }>['code'],
	typeName: string,
	setName: string
): void {
	switch (code) {
		case 'set-not-found':
			new Notice(t('notice.template-set-not-found', { name: setName }));
			break;
		case 'type-not-found':
			new Notice(t('notice.delete-entity-missing', { type: typeName }));
			break;
		case 'reserved-type':
			new Notice(t('notice.delete-entity-reserved'));
			break;
		case 'folder-missing':
			new Notice(t('notice.template-set-not-found', { name: setName }));
			break;
		case 'cancelled':
			break;
	}
}
