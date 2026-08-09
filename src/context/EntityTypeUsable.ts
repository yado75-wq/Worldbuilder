import { TemplateSetInfo } from '../types';

/**
 * A type is usable for New/Edit only when it has a non-empty field set
 * and exactly at least one title field. Empty *_Fields.md ≡ absent.
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