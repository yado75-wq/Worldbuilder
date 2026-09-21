import { App, TFile, getAllTags } from 'obsidian';
import { FieldDefinition } from '../formkit';
import { TemplateSetInfo, ValidationIssue } from '../types/templateSet';
import { WorldInfo } from '../types/world';
import { resolveTemplateSetByName } from '../context/TemplateSetResolve';
import { t } from '../i18n';

/** Frontmatter keys that are never template fields. */
const RESERVED_FM_KEYS = new Set([
	'tags',
	'position', // Obsidian
]);

/** Tags that never identify an entity type. */
const NON_ENTITY_TAGS = new Set(['world']);

export interface OrphanEntityNote {
	path: string;
	basename: string;
	tag: string;
	/** Display type id when known from folder-rules; otherwise tag casing as on the note. */
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
 * Prefer folder-rules spelling for a tag; otherwise the tag itself.
 */
function displayTypeForTag(templateSet: TemplateSetInfo, tag: string): string {
	const lower = tag.toLowerCase();
	for (const rule of templateSet.folderRules) {
		if (rule.entityType.toLowerCase() === lower) return rule.entityType;
	}
	return tag;
}

/**
 * Compare instance frontmatter to template field keys.
 * Pure — used by audit and unit tests.
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
 * Notes tagged for an entity type that has no *_Fields.md in the set.
 * Includes catalog / rulebook mode (delete type kept tags; link targets only).
 * Covers folder-rules rows without fields and arbitrary tags with no field set.
 */
export function findOrphanEntityNotes(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): OrphanEntityNote[] {
	const orphans: OrphanEntityNote[] = [];
	const seen = new Set<string>(); // path::tag

	for (const file of listWorldEntityFiles(app, worldPath)) {
		const tags = normalizedTags(app, file);
		for (const tag of tags) {
			if (NON_ENTITY_TAGS.has(tag)) continue;
			if (fieldSetKeyForTag(templateSet.fieldSets, tag)) continue;

			const key = `${file.path}::${tag}`;
			if (seen.has(key)) continue;
			seen.add(key);

			orphans.push({
				path: file.path,
				basename: file.basename,
				tag,
				entityType: displayTypeForTag(templateSet, tag),
			});
		}
	}

	return orphans;
}

/**
 * Instance ↔ template mismatches for notes whose tag matches a live field set.
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
			if (NON_ENTITY_TAGS.has(tag)) continue;
			entityType = fieldSetKeyForTag(templateSet.fieldSets, tag);
			if (entityType) break;
		}
		if (!entityType) continue;

		const fields = templateSet.fieldSets[entityType];
		if (!fields) continue;

		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = { ...(cache?.frontmatter ?? {}) };
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
 * Read-only world audit: binding, catalog-type notes, instance↔template drift.
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
					? t('audit.world-no-template-sets')
					: t('audit.world-template-missing', { name: world.templateSet }),
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
			severity: 'info',
			kind: 'catalog-type',
			file: orphan.path,
			message: t('audit.catalog-type', {
				tag: orphan.tag,
				type: orphan.entityType,
			}),
		});
	}

	for (const drift of drifts) {
		const parts: string[] = [];
		if (drift.extraKeys.length > 0) {
			parts.push(
				t('audit.schema-drift-extra', {
					type: drift.entityType,
					keys: drift.extraKeys.join(', '),
				})
			);
		}
		if (drift.missingMandatory.length > 0) {
			parts.push(
				t('audit.schema-drift-missing', {
					keys: drift.missingMandatory.join(', '),
				})
			);
		}
		issues.push({
			severity: 'warning',
			kind: 'schema-drift',
			file: drift.path,
			message: t('audit.schema-drift', {
				type: drift.entityType,
				detail: parts.join('; '),
			}),
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
