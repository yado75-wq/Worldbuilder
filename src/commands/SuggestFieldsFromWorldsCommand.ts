/**
 * Suggest fields from entity notes → new template set (Generic + notes).
 * Source set is cloned for kit files; inferred types overwrite Type_Fields.md.
 * Evidence: structured preview + _report.md (i18n prose).
 */

import { App, Notice, TFile, getAllTags, normalizePath } from 'obsidian';
import { FieldDefinition } from '../formkit';
import { PluginState, WorldBuilderSettings } from '../types/runtime';
import { TemplateSetInfo } from '../types/templateSet';
import { WorldInfo } from '../types/world';
import { hasLeadingUnderscore } from '../util/names';
import { cloneTemplateSet } from './SetupCommand';
import { worldsUsingTemplateSet } from './RenameTemplateSetCommand';
import {
	NoteFrontmatterSample,
	fieldsFromKeyStats,
	aggregateKeyStats,
	mergeFieldsAddOnly,
	serializeFieldsFile,
	resolveLinkTypesFromTargets,
	suggestFolderTarget,
	mergeFolderRulesContent,
	FolderRuleSuggestion,
} from '../state/inferFieldsFromNotes';
import { t } from '../i18n';

const NON_ENTITY_TAGS = new Set(['world']);

const FALLBACK_GENERIC: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
];

// ── Result types ──────────────────────────────────────────────────────────────

export type SuggestFieldsResult =
	| {
			ok: true;
			newSetName: string;
			typesUpdated: string[];
			reportPath: string;
	  }
	| {
			ok: false;
			code:
				| 'set-not-found'
				| 'no-worlds'
				| 'no-evidence'
				| 'invalid-name'
				| 'leading-underscore'
				| 'cancelled'
				| 'clone-failed';
			detail?: string;
	  };

export interface SuggestKeyEvidence {
	key: string;
	presentCount: number;
	noteCount: number;
	supportRatio: number;
	proposed: FieldDefinition;
	reason: string;
	fromGeneric: boolean;
	presentOnSourceType: boolean;
}

export interface SuggestTypePreview {
	typeName: string;
	typeTag: string;
	noteCount: number;
	samplePaths: string[];
	keys: SuggestKeyEvidence[];
	fieldsToWrite: FieldDefinition[];
	keysFromGeneric: string[];
	keysFromNotes: string[];
	keysOnSourceNotInNotes: string[];
	isNewFile: boolean;
	/** Approach A: folder-rules line for this type from note placement */
	folderRule: FolderRuleSuggestion;
}

export interface SuggestFieldsPreview {
	sourceSetName: string;
	newSetName: string;
	worldPaths: string[];
	types: SuggestTypePreview[];
	summaryText: string;
}

// ── Collect samples ───────────────────────────────────────────────────────────

function listWorldEntityFiles(app: App, worldPath: string): TFile[] {
	const prefix = worldPath.endsWith('/') ? worldPath : `${worldPath}/`;
	return app.vault.getFiles().filter(file => {
		if (!file.path.startsWith(prefix)) return false;
		if (file.extension !== 'md') return false;
		if (file.basename.startsWith('_')) return false;
		if (file.name === '_index.md') return false;
		return true;
	});
}

function normalizedTags(app: App, file: TFile): string[] {
	const raw = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
	return raw.map(tag => tag.replace(/^#/, '').toLowerCase());
}

/**
 * Collect frontmatter samples for entity notes in the given worlds.
 * One sample per (file, entity-type tag) pair.
 */
export function collectNoteSamples(
	app: App,
	worlds: readonly WorldInfo[]
): NoteFrontmatterSample[] {
	const samples: NoteFrontmatterSample[] = [];

	for (const world of worlds) {
		for (const file of listWorldEntityFiles(app, world.path)) {
			const tags = normalizedTags(app, file);
			const cache = app.metadataCache.getFileCache(file);
			const frontmatter: Record<string, unknown> = {
				...(cache?.frontmatter ?? {}),
			};
			delete frontmatter.position;

			for (const tag of tags) {
				if (NON_ENTITY_TAGS.has(tag)) continue;
				samples.push({
					worldPath: world.path,
					path: file.path,
					typeTag: tag,
					frontmatter,
				});
			}
		}
	}

	return samples;
}

/**
 * Type stems must never start with "_".
 * `_Character_Fields.md` is scanned as type `_Character` and breaks
 * folder-rules that reference `Character`.
 */
export function sanitizeTypeStem(raw: string): string {
	let s = raw.trim();
	while (s.startsWith('_')) s = s.slice(1);
	return s.trim();
}

function fieldSetKeyForTag(
	fieldSets: Record<string, FieldDefinition[]>,
	tag: string
): string | null {
	const lower = sanitizeTypeStem(tag).toLowerCase();
	if (!lower) return null;
	let underscored: string | null = null;
	for (const key of Object.keys(fieldSets)) {
		if (sanitizeTypeStem(key).toLowerCase() !== lower) continue;
		if (!key.startsWith('_')) return key;
		underscored = underscored ?? key;
	}
	return underscored;
}

function displayTypeName(
	templateSet: TemplateSetInfo,
	tag: string
): string {
	const cleaned = sanitizeTypeStem(tag);
	if (!cleaned) return 'Unknown';

	const fromFields = fieldSetKeyForTag(templateSet.fieldSets, cleaned);
	if (fromFields) return sanitizeTypeStem(fromFields);

	for (const rule of templateSet.folderRules) {
		if (sanitizeTypeStem(rule.entityType).toLowerCase() === cleaned.toLowerCase()) {
			return sanitizeTypeStem(rule.entityType);
		}
	}
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function genericFields(templateSet: TemplateSetInfo): FieldDefinition[] {
	const g =
		templateSet.fieldSets['Generic'] ??
		templateSet.fieldSets['generic'];
	if (g && g.length > 0) {
		return g.map(f => ({ ...f }));
	}
	return FALLBACK_GENERIC.map(f => ({ ...f }));
}

function reasonForField(field: FieldDefinition, fromGeneric: boolean): string {
	if (fromGeneric) return 'from-generic';
	if (field.display === 'title') return 'name-title';
	if (field.type === 'link') return 'link-majority';
	if (field.type === 'multiselect' && field.multiKind === 'link') return 'list-link';
	if (field.type === 'multiselect') return 'list';
	return 'text-default';
}

/**
 * Pass 1 output: basename → display type names from tags on those notes.
 * Enables pass 2 linkTypes (e.g. gear → Weapon>Armor).
 */
function buildBasenameToTypes(
	samples: readonly NoteFrontmatterSample[],
	sourceSet: TemplateSetInfo
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const s of samples) {
		const base = s.path.includes('/')
			? s.path.slice(s.path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
			: s.path.replace(/\.md$/i, '');
		const typeName = displayTypeName(sourceSet, s.typeTag);
		const list = map.get(base) ?? map.get(base.toLowerCase()) ?? [];
		if (!list.some(t => t.toLowerCase() === typeName.toLowerCase())) {
			list.push(typeName);
		}
		map.set(base, list);
		// case-insensitive fallback key
		if (base !== base.toLowerCase()) {
			map.set(base.toLowerCase(), list);
		}
	}
	return map;
}

// ── Preview ───────────────────────────────────────────────────────────────────

export function buildSuggestFieldsPreview(
	app: App,
	sourceSet: TemplateSetInfo,
	worlds: readonly WorldInfo[],
	newSetName: string,
	/** If non-empty, only these type tags (lowercase). Empty = all with evidence. */
	typeTagFilter: readonly string[] = []
): SuggestFieldsPreview | null {
	const samples = collectNoteSamples(app, worlds);
	if (samples.length === 0) return null;

	const filterSet =
		typeTagFilter.length > 0
			? new Set(typeTagFilter.map(t => t.toLowerCase()))
			: null;

	const tags = new Set(samples.map(s => s.typeTag));
	const types: SuggestTypePreview[] = [];
	const generic = genericFields(sourceSet);
	const genericKeys = new Set(generic.map(f => f.key));

	// Pass 1: all type tags with evidence (drives which Type_Fields.md we create).
	// Pass 2: resolve [[links]] to those types for multiselect:link / link: chains.
	const basenameToTypes = buildBasenameToTypes(samples, sourceSet);

	for (const tag of [...tags].sort()) {
		if (filterSet && !filterSet.has(tag)) continue;
		// Never build types from underscore-only / archive-style tags
		if (!sanitizeTypeStem(tag)) continue;

		const typeName = displayTypeName(sourceSet, tag);
		if (!typeName || typeName.startsWith('_')) continue;
		const typeSamples = samples.filter(s => s.typeTag === tag);
		const noteCount = new Set(typeSamples.map(s => s.path)).size;
		const keyStats = aggregateKeyStats(samples, tag);

		const linkTypesByKey = new Map<string, string[]>();
		for (const stats of keyStats) {
			if (stats.linkTargetBasenames.length === 0) continue;
			const resolved = resolveLinkTypesFromTargets(
				stats.linkTargetBasenames,
				basenameToTypes
			);
			if (resolved.length > 0) linkTypesByKey.set(stats.key, resolved);
		}

		const inferred = fieldsFromKeyStats(keyStats, linkTypesByKey);
		const fieldsToWrite = mergeFieldsAddOnly(generic, inferred);

		const sourceFields = sourceSet.fieldSets[typeName] ??
			sourceSet.fieldSets[fieldSetKeyForTag(sourceSet.fieldSets, tag) ?? ''] ??
			[];
		const sourceKeySet = new Set(sourceFields.map(f => f.key));
		const noteKeySet = new Set(keyStats.map(k => k.key));

		const keysFromNotes = inferred.map(f => f.key).filter(k => !genericKeys.has(k));
		const keysOnSourceNotInNotes = [...sourceKeySet].filter(
			k => !noteKeySet.has(k) && !genericKeys.has(k)
		);

		const keys: SuggestKeyEvidence[] = [];
		for (const f of fieldsToWrite) {
			const stats = keyStats.find(k => k.key === f.key);
			const fromGeneric = genericKeys.has(f.key);
			const presentCount = stats?.presentCount ?? (fromGeneric ? noteCount : 0);
			const supportRatio = noteCount > 0 ? presentCount / noteCount : 0;
			keys.push({
				key: f.key,
				presentCount,
				noteCount,
				supportRatio,
				proposed: f,
				reason: reasonForField(f, fromGeneric),
				fromGeneric,
				presentOnSourceType: sourceKeySet.has(f.key),
			});
		}

		const samplePaths = [...new Set(typeSamples.map(s => s.path))].slice(0, 10);

		const placements = typeSamples.map(s => ({
			worldPath: s.worldPath,
			path: s.path,
		}));
		const folderGuess = suggestFolderTarget(placements);
		const folderRule: FolderRuleSuggestion = {
			entityType: typeName,
			...folderGuess,
		};

		types.push({
			typeName,
			typeTag: tag,
			noteCount,
			samplePaths,
			keys,
			fieldsToWrite,
			keysFromGeneric: generic.map(f => f.key),
			keysFromNotes,
			keysOnSourceNotInNotes,
			isNewFile: sourceFields.length === 0,
			folderRule,
		});
	}

	if (types.length === 0) return null;

	const worldPaths = worlds.map(w => w.path);
	const summaryLines = types.map(tp => {
		const added = tp.keysFromNotes.join(', ') || '—';
		const folder = tp.folderRule.targetFolder;
		return t('suggest.summary-type-line', {
			type: tp.typeName,
			notes: String(tp.noteCount),
			added,
			newFile: tp.isNewFile ? t('suggest.summary-new-file') : t('suggest.summary-rebuild'),
			folder,
		});
	});

	const summaryText = [
		t('suggest.summary-head', {
			source: sourceSet.name,
			name: newSetName,
			worlds: String(worlds.length),
		}),
		'',
		...summaryLines,
		'',
		t('suggest.summary-foot'),
	].join('\n');

	return {
		sourceSetName: sourceSet.name,
		newSetName,
		worldPaths,
		types,
		summaryText,
	};
}

// ── Report ────────────────────────────────────────────────────────────────────

function shapeLabel(field: FieldDefinition): string {
	if (field.display === 'title') {
		return t('suggest.report.shape-title');
	}
	if (field.type === 'link') {
		const chain = (field.linkTypes ?? []).join('>');
		return chain
			? t('suggest.report.shape-link-chain', { chain })
			: t('suggest.report.shape-link');
	}
	if (field.type === 'multiselect' && field.multiKind === 'link') {
		const chain = (field.linkTypes ?? []).join('>');
		return chain
			? t('suggest.report.shape-multiselect-link', { chain })
			: t('suggest.report.shape-multiselect-link-empty');
	}
	if (field.type === 'multiselect') return t('suggest.report.shape-multiselect');
	if (field.mandatory) return t('suggest.report.shape-text-mandatory');
	return t('suggest.report.shape-text');
}

function actionLabel(ev: SuggestKeyEvidence): string {
	if (ev.fromGeneric) return t('suggest.report.action-generic');
	if (ev.supportRatio < 0.2 || (ev.presentCount < 2 && ev.noteCount > 2)) {
		return t('suggest.report.action-added-low');
	}
	return t('suggest.report.action-added');
}

/**
 * Human-readable _report.md body (prose via t(); keys/paths raw).
 */
export function formatSuggestFieldsReport(preview: SuggestFieldsPreview): string {
	const lines: string[] = [];

	lines.push(`# ${t('suggest.report.title')}`);
	lines.push('');
	lines.push(t('suggest.report.intro-clone', { source: preview.sourceSetName }));
	lines.push('');
	lines.push(t('suggest.report.intro-fields'));
	lines.push('');
	lines.push(t('suggest.report.intro-folder-rules'));
	lines.push('');
	lines.push(t('suggest.report.intro-assign'));
	lines.push('');
	lines.push(`- **${t('suggest.report.meta-source')}:** \`${preview.sourceSetName}\``);
	lines.push(`- **${t('suggest.report.meta-new')}:** \`${preview.newSetName}\``);
	lines.push(
		`- **${t('suggest.report.meta-worlds')}:** ${preview.worldPaths.map(p => `\`${p}\``).join(', ') || '—'}`
	);
	lines.push('');
	lines.push(`## ${t('suggest.report.summary-heading')}`);
	lines.push('');
	lines.push(
		`| ${t('suggest.report.col-type')} | ${t('suggest.report.col-notes')} | ${t('suggest.report.col-from-notes')} | ${t('suggest.report.col-folder')} | ${t('suggest.report.col-new-file')} |`
	);
	lines.push('| --- | --- | --- | --- | --- |');
	for (const tp of preview.types) {
		const fr = tp.folderRule;
		const folderCell =
			fr.targetFolder === '*'
				? `\`*\` (${fr.supportCount}/${fr.noteCount})`
				: `\`${fr.targetFolder}\` (${fr.supportCount}/${fr.noteCount})`;
		lines.push(
			`| ${tp.typeName} | ${tp.noteCount} | ${tp.keysFromNotes.join(', ') || '—'} | ${folderCell} | ${
				tp.isNewFile ? t('suggest.report.yes') : t('suggest.report.no')
			} |`
		);
	}

	for (const tp of preview.types) {
		lines.push('');
		lines.push(`## ${tp.typeName}`);
		lines.push('');
		lines.push(
			t('suggest.report.type-intro', {
				count: String(tp.noteCount),
				tag: tp.typeTag,
			})
		);
		lines.push('');
		lines.push(
			`| ${t('suggest.report.col-key')} | ${t('suggest.report.col-support')} | ${t('suggest.report.col-shape')} | ${t('suggest.report.col-action')} |`
		);
		lines.push('| --- | --- | --- | --- |');
		for (const ev of tp.keys) {
			const support = `${ev.presentCount}/${ev.noteCount}`;
			lines.push(
				`| \`${ev.key}\` | ${support} | ${shapeLabel(ev.proposed)} | ${actionLabel(ev)} |`
			);
		}

		if (tp.keysOnSourceNotInNotes.length > 0) {
			lines.push('');
			lines.push(
				t('suggest.report.source-keys-not-copied', {
					keys: tp.keysOnSourceNotInNotes.map(k => `\`${k}\``).join(', '),
				})
			);
		}

		if (tp.samplePaths.length > 0) {
			lines.push('');
			lines.push(t('suggest.report.sample-notes'));
			for (const p of tp.samplePaths) {
				lines.push(`- \`${p}\``);
			}
		}

		lines.push('');
		lines.push(t('suggest.report.what-it-means', { type: tp.typeName }));
	}

	lines.push('');
	lines.push('---');
	lines.push('');
	lines.push(`## ${t('suggest.report.next-heading')}`);
	lines.push('');
	lines.push(`1. ${t('suggest.report.next-1')}`);
	lines.push(`2. ${t('suggest.report.next-2')}`);
	lines.push(`3. ${t('suggest.report.next-3')}`);
	lines.push('');

	return lines.join('\n');
}

// ── Apply ─────────────────────────────────────────────────────────────────────

function err(
	code: Extract<SuggestFieldsResult, { ok: false }>['code'],
	detail?: string
): SuggestFieldsResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

/**
 * Create a new template set from source + note evidence.
 *
 * confirm: return true to proceed (caller shows preview.summaryText).
 */
export async function suggestFieldsFromWorlds(
	app: App,
	state: PluginState,
	settings: WorldBuilderSettings,
	sourceSetName: string,
	newSetNameRaw: string,
	confirm: (preview: SuggestFieldsPreview) => Promise<boolean>,
	options?: {
		worldPaths?: string[];
		typeTags?: string[];
	}
): Promise<SuggestFieldsResult> {
	const sourceSet = state.templateSets.find(s => s.name === sourceSetName);
	if (!sourceSet) {
		new Notice(t('notice.template-set-not-found', { name: sourceSetName }));
		return err('set-not-found', sourceSetName);
	}

	const newSetName = newSetNameRaw.trim();
	if (!newSetName) {
		new Notice(t('notice.rename-template-invalid-name'));
		return err('invalid-name');
	}
	if (hasLeadingUnderscore(newSetName)) {
		new Notice(t('notice.leading-underscore'));
		return err('leading-underscore', newSetName);
	}

	let worlds = worldsUsingTemplateSet(state.worlds, sourceSetName);
	if (options?.worldPaths && options.worldPaths.length > 0) {
		const allow = new Set(options.worldPaths);
		worlds = worlds.filter(w => allow.has(w.path));
	}
	if (worlds.length === 0) {
		// Fall back: any worlds in state if none bound (edge case)
		worlds = state.worlds.filter(w =>
			!options?.worldPaths?.length || options.worldPaths.includes(w.path)
		);
	}
	if (worlds.length === 0) {
		new Notice(t('notice.suggest-no-worlds'));
		return err('no-worlds');
	}

	const preview = buildSuggestFieldsPreview(
		app,
		sourceSet,
		worlds,
		newSetName,
		options?.typeTags ?? []
	);
	if (!preview) {
		new Notice(t('notice.suggest-no-evidence'));
		return err('no-evidence');
	}

	const ok = await confirm(preview);
	if (!ok) return err('cancelled');

	const cloned = await cloneTemplateSet(app, settings, sourceSetName, newSetName);
	if (!cloned.ok) {
		return err('clone-failed', cloned.code);
	}

	const setPath = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}/${newSetName}`
	);

	const typesUpdated: string[] = [];
	for (const tp of preview.types) {
		const stem = sanitizeTypeStem(tp.typeName);
		if (!stem || stem.startsWith('_')) continue;

		const fileName = `${stem}_Fields.md`;
		const targetPath = normalizePath(`${setPath}/${fileName}`);
		const body = serializeFieldsFile(tp.fieldsToWrite);
		const existing = app.vault.getAbstractFileByPath(targetPath);
		if (existing instanceof TFile) {
			await app.vault.modify(existing, body);
		} else {
			await app.vault.create(targetPath, body);
		}
		// Remove mistaken archive-style duplicate if present (older bug / hand rename)
		const badPath = normalizePath(`${setPath}/_${stem}_Fields.md`);
		const bad = app.vault.getAbstractFileByPath(badPath);
		if (bad instanceof TFile) {
			await app.fileManager.trashFile(bad);
		}
		typesUpdated.push(stem);
	}

	// Approach A: update folder-rules lines only for types in this run
	const rulesPath = normalizePath(`${setPath}/folder-rules.md`);
	const rulesUpdates = preview.types.map(tp => ({
		entityType: sanitizeTypeStem(tp.typeName),
		targetFolder: tp.folderRule.targetFolder,
	}));
	const existingRulesFile = app.vault.getAbstractFileByPath(rulesPath);
	const existingRulesRaw =
		existingRulesFile instanceof TFile ? await app.vault.read(existingRulesFile) : '';
	const mergedRules = mergeFolderRulesContent(existingRulesRaw, rulesUpdates);
	if (existingRulesFile instanceof TFile) {
		await app.vault.modify(existingRulesFile, mergedRules);
	} else {
		await app.vault.create(rulesPath, mergedRules);
	}

	const reportPath = normalizePath(`${setPath}/_report.md`);
	const reportBody = formatSuggestFieldsReport(preview);
	const existingReport = app.vault.getAbstractFileByPath(reportPath);
	if (existingReport instanceof TFile) {
		await app.vault.modify(existingReport, reportBody);
	} else {
		await app.vault.create(reportPath, reportBody);
	}

	new Notice(
		t('notice.suggest-done', {
			name: newSetName,
			types: typesUpdated.join(', '),
			report: '_report.md',
		})
	);

	return {
		ok: true,
		newSetName,
		typesUpdated,
		reportPath,
	};
}
