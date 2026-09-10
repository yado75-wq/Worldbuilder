import { App, TFile, getAllTags } from 'obsidian';
import { FieldDefinition } from '../formkit';
import { TemplateSetInfo, ValidationIssue } from '../types/templateSet';
import { WorldInfo } from '../types/world';
import { resolveTemplateSetByName } from '../context/TemplateSetResolve';

/** Frontmatter keys that are never template fields. */
const RESERVED_FM_KEYS = new Set([
	'tags',
	'position', // Obsidian
]);

export interface OrphanEntityNote {
	path: string;
	basename: string;
	tag: string;
	entityType: string;
}

export interface SchemaDriftHit {
	path: string;
	basename: string;
	entityType: string;
	/** Keys on the note not in the type's field definitions */
	extraKeys: string[];
	/** Mandatory field keys absent from the note */
	missingMandatory: string[];
}

export interface WorldAuditResult {
	worldPath: string;
	worldName: string;
	templateSetName: string;
	templateSet: TemplateSetInfo | null;
	templateSetMissing: boolean;
	orphans: OrphanEntityNote[];
	drifts: SchemaDriftHit[];
	issues: ValidationIssue[];
}

function normalizedTags(app: App, file: TFile): string[] {
	const raw = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
	return raw.map(t => t.replace(/^#/, '').toLowerCase());
}

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

function fieldSetKeyForTag(
	fieldSets: Record<string, FieldDefinition[]>,
	tag: string
): string | null {
	const lower = tag.toLowerCase();
	for (const key of Object.keys(fieldSets)) {
		if (key.toLowerCase() === lower) return key;
	}
	return null;
}

/**
 * Compare instance frontmatter to template field keys.
 * Pure — used by audit and unit tests; pre-step for “restore template from entities”.
 */
export function compareInstanceToTemplate(
	frontmatter: Record<string, unknown>,
	fields: readonly FieldDefinition[]
): { extraKeys: string[]; missingMandatory: string[] } {
	const templateKeys = new Set(fields.map(f => f.key));
	const extraKeys: string[] = [];

	for (const key of Object.keys(frontmatter)) {
		if (RESERVED_FM_KEYS.has(key)) continue;
		if (templateKeys.has(key)) continue;
		extraKeys.push(key);
	}

	const missingMandatory: string[] = [];
	for (const field of fields) {
		if (!field.mandatory) continue;
		const value = frontmatter[field.key];
		if (value === undefined || value === null) {
			missingMandatory.push(field.key);
			continue;
		}
		if (typeof value === 'string' && value.trim() === '') {
			missingMandatory.push(field.key);
		}
	}

	return { extraKeys, missingMandatory };
}

/**
 * Notes tagged for a folder-rules type that has no *_Fields.md.
 */
export function findOrphanEntityNotes(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): OrphanEntityNote[] {
	const knownTypes = new Set(
		Object.keys(templateSet.fieldSets).map(k => k.toLowerCase())
	);

	const missingRuleTypes: { entityType: string; tag: string }[] = [];
	for (const rule of templateSet.folderRules) {
		const lower = rule.entityType.toLowerCase();
		if (knownTypes.has(lower)) continue;
		if (lower === 'worldmeta') continue;
		missingRuleTypes.push({ entityType: rule.entityType, tag: lower });
	}

	if (missingRuleTypes.length === 0) return [];

	const orphans: OrphanEntityNote[] = [];
	for (const file of listWorldEntityFiles(app, worldPath)) {
		const tags = new Set(normalizedTags(app, file));
		for (const { entityType, tag } of missingRuleTypes) {
			if (!tags.has(tag)) continue;
			orphans.push({
				path: file.path,
				basename: file.basename,
				tag,
				entityType,
			});
		}
	}

	return orphans;
}

/**
 * Instance ↔ template mismatches for notes whose tag matches a live field set.
 * Prefers metadataCache frontmatter; falls back to empty object if missing.
 */
export function findSchemaDrift(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): SchemaDriftHit[] {
	const drifts: SchemaDriftHit[] = [];

	for (const file of listWorldEntityFiles(app, worldPath)) {
		const tags = normalizedTags(app, file);
		let entityType: string | null = null;
		for (const tag of tags) {
			if (tag === 'world') continue;
			entityType = fieldSetKeyForTag(templateSet.fieldSets, tag);
			if (entityType) break;
		}
		if (!entityType) continue;

		const fields = templateSet.fieldSets[entityType];
		if (!fields) continue;

		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = { ...(cache?.frontmatter ?? {}) };
		// Strip Obsidian internal keys if present
		delete frontmatter.position;

		const { extraKeys, missingMandatory } = compareInstanceToTemplate(
			frontmatter,
			fields
		);
		if (extraKeys.length === 0 && missingMandatory.length === 0) continue;

		drifts.push({
			path: file.path,
			basename: file.basename,
			entityType,
			extraKeys,
			missingMandatory,
		});
	}

	return drifts;
}

/**
 * Read-only world audit: binding, missing-type orphans, instance↔template drift.
 * Drift findings are the pre-step inventory for “restore / align template from entities”.
 */
export function auditWorld(
	app: App,
	world: WorldInfo,
	templateSets: readonly TemplateSetInfo[]
): WorldAuditResult {
	const issues: ValidationIssue[] = [];
	const resolved = resolveTemplateSetByName([...templateSets], world.templateSet);

	if (!resolved.ok) {
		issues.push({
			severity: 'error',
			kind: 'other',
			message:
				resolved.reason === 'none'
					? 'No template sets in the vault; restore or create one.'
					: `Template set "${world.templateSet}" not found; reassign in settings or fix _index.md.`,
		});

		return {
			worldPath: world.path,
			worldName: world.name,
			templateSetName: world.templateSet,
			templateSet: null,
			templateSetMissing: true,
			orphans: [],
			drifts: [],
			issues,
		};
	}

	const templateSet = resolved.set;
	const orphans = findOrphanEntityNotes(app, world.path, templateSet);
	const drifts = findSchemaDrift(app, world.path, templateSet);

	for (const orphan of orphans) {
		issues.push({
			severity: 'warning',
			kind: 'other',
			file: orphan.path,
			message: `Note tagged "${orphan.tag}" but type "${orphan.entityType}" has no fields file (folder-rules still references it). Candidate for restore-template-from-entities.`,
		});
	}

	for (const drift of drifts) {
		const parts: string[] = [];
		if (drift.extraKeys.length > 0) {
			parts.push(
				`extra keys not in ${drift.entityType}_Fields.md: ${drift.extraKeys.join(', ')}`
			);
		}
		if (drift.missingMandatory.length > 0) {
			parts.push(
				`missing mandatory: ${drift.missingMandatory.join(', ')}`
			);
		}
		issues.push({
			severity: 'warning',
			kind: 'other',
			file: drift.path,
			message: `Instance ↔ template mismatch (${drift.entityType}): ${parts.join('; ')}.`,
		});
	}

	return {
		worldPath: world.path,
		worldName: world.name,
		templateSetName: world.templateSet,
		templateSet,
		templateSetMissing: false,
		orphans,
		drifts,
		issues,
	};
}
