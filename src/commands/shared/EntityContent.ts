import { App, getAllTags } from 'obsidian';
import { FieldDefinition, TemplateSetInfo, WorldInfo } from '../../types';

// Pure content builders live in EntityContentBuilder.ts (no Obsidian
// dependency, unit tested directly). Re-exported here so existing imports
// of `from './shared/EntityContent'` keep working unchanged.
export { buildEntityContent, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './EntityContentBuilder';

export function buildLinkCandidates(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[],
	templateSet: TemplateSetInfo,
	excludeBasename?: string
): Record<string, string[]> {
	const candidates: Record<string, string[]> = {};

	for (const f of fields) {
		if (f.type === 'link') {
			const types = linkEntityTypes(f);
			if (types.length === 0) continue;

			// Same control flow as before: primary type, then fallback type if empty
			let names = collectBasenamesByEntityType(app, world, types[0]!, excludeBasename);
			if (names.length === 0 && types[1]) {
				names = collectBasenamesByEntityType(app, world, types[1], excludeBasename);
			}
			candidates[f.key] = names;
			continue;
		}

		if (f.type === 'timeframe') {
			candidates[f.key] = collectAnchorCandidates(app, world, templateSet, excludeBasename);
		}
	}

	return candidates;
}

function linkEntityTypes(field: FieldDefinition): string[] {
	if (field.linkTypes && field.linkTypes.length > 0) {
		return field.linkTypes;
	}
	const legacy = [field.linkFolder, field.linkFallback]
		.map(s => s?.trim())
		.filter((s): s is string => !!s);
	return legacy;
}

/** Notes under the world tagged with this entity type (type name → tag). */
function collectBasenamesByEntityType(
	app: App,
	world: WorldInfo,
	entityType: string,
	excludeBasename?: string
): string[] {
	const tag = entityType.toLowerCase();
	return app.vault.getFiles()
		.filter(file => {
			if (!file.path.startsWith(world.path + '/')) return false;
			if (file.extension !== 'md') return false;
			if (file.basename.startsWith('_')) return false;
			if (file.basename === excludeBasename) return false;

			const rawTags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
			const normalized = rawTags.map(t => t.replace(/^#/, '').toLowerCase());
			return normalized.includes(tag);
		})
		.map(file => file.basename);
}

/**
 * Candidates for a `timeframe` field's anchor picker: every entity, in any
 * folder, whose own entity type has a `timeframe` field of its own —
 * Milestones/Events/Epochs conventionally, but discovered structurally via
 * `templateSet.fieldSets` rather than assumed by name. Entity type names
 * (and the tags Obsidian derives from them, `tags: - ${entityType
 * .toLowerCase()}` in EntityContentBuilder.ts) are template-set-defined and
 * may be in any language, so matching happens on the tag actually present
 * on each file, never on a hardcoded English word like "milestone". There
 * is no dedicated anchor folder — by design, permanently — so this scans
 * the whole world rather than any single `linkFolder`.
 *
 * `excludeBasename`, when editing an existing entity, removes that entity
 * from its own candidate list — an entity anchoring to its own timepoint
 * isn't meaningful (trivially either a no-op or a cycle, TimeframeResolver
 * .ts's `cycle` case).
 */
function collectAnchorCandidates(
	app: App,
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	excludeBasename?: string
): string[] {
	const anchorTags = new Set(
		Object.entries(templateSet.fieldSets)
			.filter(([, typeFields]) => typeFields.some(tf => tf.type === 'timeframe'))
			.map(([entityType]) => entityType.toLowerCase())
	);
	if (anchorTags.size === 0) return [];

	return app.vault.getFiles()
		.filter(file => {
			if (!file.path.startsWith(world.path + '/')) return false;
			if (file.extension !== 'md') return false;
			if (file.basename.startsWith('_')) return false;
			if (file.basename === excludeBasename) return false;

			const rawTags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
			const normalizedTags = rawTags.map(t => t.replace(/^#/, '').toLowerCase());
			return normalizedTags.some(t => anchorTags.has(t));
		})
		.map(file => file.basename);
}
