import { App, getAllTags } from 'obsidian';
import { FieldDefinition, TemplateSetInfo, WorldInfo } from '../../types';

export { buildEntityContent, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './EntityContentBuilder';

export interface LinkCandidateGroup {
	entityType: string;
	/** Sorted A–Z; empty array → UI shows non-selectable "empty" placeholder. */
	names: string[];
}

export interface FieldCandidates {
	linkGroups: Record<string, LinkCandidateGroup[]>;
	timeframeAnchors: Record<string, string[]>;
}

export function buildFieldCandidates(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[],
	templateSet: TemplateSetInfo,
	excludeBasename?: string
): FieldCandidates {
	const linkGroups: Record<string, LinkCandidateGroup[]> = {};
	const timeframeAnchors: Record<string, string[]> = {};

	for (const f of fields) {
		if (f.type === 'link' || (f.type === 'multiselect' && f.multiKind === 'link')) {
			const types = linkEntityTypes(f);
			if (types.length === 0) continue;

			const groups: LinkCandidateGroup[] = [];
			for (const entityType of types) {
				const names = collectBasenamesByEntityType(app, world, entityType, excludeBasename)
					.sort((a, b) => a.localeCompare(b));
				groups.push({ entityType, names });
			}
			linkGroups[f.key] = groups;
			continue;
		}

		if (f.type === 'timeframe') {
			timeframeAnchors[f.key] = collectAnchorCandidates(
				app, world, templateSet, excludeBasename
			);
		}
	}

	return { linkGroups, timeframeAnchors };
}

/** Flat map for callers that only need names (e.g. older tests). Prefer buildFieldCandidates. */
export function buildLinkCandidates(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[],
	templateSet: TemplateSetInfo,
	excludeBasename?: string
): Record<string, string[]> {
	const { linkGroups, timeframeAnchors } = buildFieldCandidates(
		app, world, fields, templateSet, excludeBasename
	);
	const flat: Record<string, string[]> = { ...timeframeAnchors };
	for (const [key, groups] of Object.entries(linkGroups)) {
		flat[key] = groups.flatMap(g => g.names);
	}
	return flat;
}

function linkEntityTypes(field: FieldDefinition): string[] {
	if (field.linkTypes && field.linkTypes.length > 0) {
		return field.linkTypes;
	}
	return [field.linkFolder, field.linkFallback]
		.map(s => s?.trim())
		.filter((s): s is string => !!s);
}

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