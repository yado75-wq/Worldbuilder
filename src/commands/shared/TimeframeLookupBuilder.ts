import { App, TFile, getAllTags } from 'obsidian';
import { FieldDefinition, TemplateSetInfo, WorldInfo } from '../../types';
import { TimeframeLookup } from '../../time/TimeframeResolver';
import { TimeframeCheckTarget } from './TimeframeResolutionReport';

/**
 * The world's configured `time_unit` (TIME_DESIGN.md §4), defaulting to
 * `'years'` when unset — nothing is ever written to frontmatter for an
 * unset value (RefreshDashboardCommand.ts shows the same default for
 * display, without persisting it either), so this reads it the same way
 * each time it's needed rather than relying on it being stored anywhere.
 */
export function getWorldTimeUnit(app: App, world: WorldInfo): string {
	const frontmatter = app.metadataCache.getFileCache(world.indexFile)?.frontmatter;
	const raw: unknown = frontmatter?.['time_unit'];
	return typeof raw === 'string' && raw.trim() ? raw.trim() : 'years';
}

/** Entity files in `worldPath/targetFolder`, excluding `_index` and generic-tagged notes. */
export function getEntityFiles(app: App, worldPath: string, targetFolder: string): TFile[] {
	const folderPath = `${worldPath}/${targetFolder}`;
	return app.vault.getFiles().filter(f =>
		f.path.startsWith(folderPath + '/') &&
		f.extension === 'md' &&
		f.basename !== '_index' &&
		!getAllTags(app.metadataCache.getFileCache(f) ?? {})
			?.some(t => t === '#generic' || t === 'generic')
	);
}

/** Every real (non-generic, non-`_`-prefixed) entity file anywhere in the world, regardless of which folder it's in. */
function getWorldEntityFiles(app: App, worldPath: string): TFile[] {
	return app.vault.getFiles().filter(f =>
		f.path.startsWith(worldPath + '/') &&
		f.extension === 'md' &&
		!f.basename.startsWith('_') &&
		!getAllTags(app.metadataCache.getFileCache(f) ?? {})
			?.some(t => t === '#generic' || t === 'generic')
	);
}

/**
 * Builds the `TimeframeLookup` (TimeframeResolver.ts) plus the list of
 * check targets (entities with a *present* timeframe value) across the
 * whole template set. Used both for the Needs Attention resolution check
 * (RefreshDashboardCommand.ts) and for computing a "Resolved:" display
 * value when generating or regenerating an entity's own content
 * (CreateEntityCommand.ts, EditEntityCommand.ts) — one lookup, same shape,
 * either consumer.
 *
 * Entities are discovered by their own tag across the *whole* world, not
 * by walking `folderRules` and scanning each rule's `targetFolder` — an
 * entity type's folder-rules.md mapping isn't necessarily where every
 * entity of that type actually lives (e.g. a folder that only matches the
 * `*` wildcard, or anywhere folder-rules.md simply doesn't cover), and an
 * entity sitting outside that specific folder was previously invisible to
 * this lookup entirely: anchoring to it failed with "has no timeframe
 * defined" even though its frontmatter clearly had one, and — since this
 * same scan feeds the Needs Attention target list — that failure was never
 * even reported anywhere. This matches the same tag-based approach already
 * used for entity classification (ContextResolver.ts's `findEntityFile`)
 * and anchor-picker candidates (EntityContent.ts's
 * `collectAnchorCandidates`), for the same underlying reason.
 *
 * Each entity type's timeframe field is whichever field in its field set
 * has `type === 'timeframe'` — TIME_DESIGN.md's model is one canonical
 * timeframe field per entity type (§1, §7), so the first match is
 * authoritative.
 *
 * The ref used for lookups and as a resolution target is the entity's
 * basename, matching how `[[Entity]]` links are written elsewhere against
 * these files — the vault convention this project uses for wikilink
 * targets.
 */
export function buildTimeframeLookup(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): { lookup: TimeframeLookup; targets: TimeframeCheckTarget[] } {
	const rawByRef = new Map<string, string | undefined>();
	const targets: TimeframeCheckTarget[] = [];

	const timeframeFieldByTag = new Map<string, { entityType: string; field: FieldDefinition }>();
	for (const [entityType, fields] of Object.entries(templateSet.fieldSets)) {
		const timeframeField = fields.find(f => f.type === 'timeframe');
		if (timeframeField) timeframeFieldByTag.set(entityType.toLowerCase(), { entityType, field: timeframeField });
	}
	if (timeframeFieldByTag.size === 0) {
		return { lookup: () => undefined, targets: [] };
	}

	for (const entity of getWorldEntityFiles(app, worldPath)) {
		const cache = app.metadataCache.getFileCache(entity);
		const normalizedTags = (getAllTags(cache ?? {}) ?? []).map(t => t.replace(/^#/, '').toLowerCase());

		const matchingTag = normalizedTags.find(t => timeframeFieldByTag.has(t));
		if (!matchingTag) continue;
		const match = timeframeFieldByTag.get(matchingTag);
		if (!match) continue;
		const { entityType, field: timeframeField } = match;

		const raw: unknown = cache?.frontmatter?.[timeframeField.key];
		const rawStr = typeof raw === 'string' ? raw : undefined;

		const ref = entity.basename;
		rawByRef.set(ref, rawStr);

		if (rawStr !== undefined) {
			targets.push({
				ref, path: entity.path, basename: entity.basename, fieldLabel: timeframeField.label, entityType,
			});
		}
	}

	const lookup: TimeframeLookup = ref => rawByRef.get(ref);
	return { lookup, targets };
}
