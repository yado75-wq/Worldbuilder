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
	templateSet: TemplateSetInfo
): Record<string, string[]> {
	const candidates: Record<string, string[]> = {};

	for (const f of fields) {
		if (f.type === 'link') {
			if (!f.linkFolder) continue;

			candidates[f.key] = collectEntityBasenames(app, `${world.path}/${f.linkFolder}`);

			if (candidates[f.key]?.length === 0 && f.linkFallback) {
				candidates[f.key] = collectEntityBasenames(app, `${world.path}/${f.linkFallback}`);
			}
			continue;
		}

		if (f.type === 'timeframe') {
			candidates[f.key] = collectAnchorCandidates(app, world, templateSet);
		}
	}

	return candidates;
}

/** Real (non-generic, non-`_`-prefixed) entity files under `folderPath`, recursively. */
function collectEntityBasenames(app: App, folderPath: string): string[] {
	return app.vault.getFiles()
		.filter(file => {
			if (!file.path.startsWith(folderPath + '/')) return false;
			if (file.extension !== 'md') return false;
			if (file.basename.startsWith('_')) return false; // _index, _dashboard, sub-dashboards
			const cache = app.metadataCache.getFileCache(file);
			const tags = getAllTags(cache ?? {}) ?? [];
			return !tags.includes('generic') && !tags.includes('#generic');
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
 */
function collectAnchorCandidates(app: App, world: WorldInfo, templateSet: TemplateSetInfo): string[] {
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

			const rawTags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
			const normalizedTags = rawTags.map(t => t.replace(/^#/, '').toLowerCase());
			return normalizedTags.some(t => anchorTags.has(t));
		})
		.map(file => file.basename);
}
