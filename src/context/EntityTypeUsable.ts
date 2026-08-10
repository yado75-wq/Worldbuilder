import { TemplateSetInfo } from '../types';

/**
 * Types that are not placed via folder-rules / auto-*.
 * Extend later if more non-entity field sets appear.
 */
const NON_PLACEMENT_TYPES = new Set(['worldmeta']);

/**
 * A type is usable for New/Edit only when it has a non-empty field set
 * and at least one title field. Empty *_Fields.md ≡ absent.
 */
export function isEntityTypeUsable(
	templateSet: TemplateSetInfo | null | undefined,
	entityType: string
): boolean {
	if (!templateSet) return false;
	const fields = templateSet.fieldSets[entityType];
	if (!fields || fields.length === 0) return false;
	return fields.some(f => f.display === 'title');
}

export function resolveTemplateSetForWorld(
	templateSets: TemplateSetInfo[],
	templateSetName: string
): TemplateSetInfo | undefined {
	return templateSets.find(ts => ts.name === templateSetName) ?? templateSets[0];
}

function isNonPlacementType(entityType: string): boolean {
	return NON_PLACEMENT_TYPES.has(entityType.toLowerCase());
}

/**
 * Types offered as wildcard "New …" (create in the folder under the cursor):
 * - explicit `Type | *` in folder-rules, if usable
 * - usable types not mentioned in folder-rules at all (treated as *)
 *
 * Types with a concrete folder rule are not auto-*; they only get New on that entity folder.
 * WorldMeta (and later similar) never appear here.
 */
export function listUsableWildcardTypes(
	templateSet: TemplateSetInfo | null | undefined
): string[] {
	if (!templateSet) return [];

	const mentioned = new Set(
		templateSet.folderRules.map(r => r.entityType)
	);

	const fromExplicitStar = templateSet.folderRules
		.filter(r => r.targetFolder === '*')
		.map(r => r.entityType)
		.filter(t => isEntityTypeUsable(templateSet, t) && !isNonPlacementType(t));

	const fromUnlisted = Object.keys(templateSet.fieldSets)
		.filter(t => !mentioned.has(t))
		.filter(t => !isNonPlacementType(t))
		.filter(t => isEntityTypeUsable(templateSet, t));

	const seen = new Set<string>();
	const result: string[] = [];
	for (const t of [...fromExplicitStar, ...fromUnlisted]) {
		if (seen.has(t)) continue;
		seen.add(t);
		result.push(t);
	}
	return result;
}