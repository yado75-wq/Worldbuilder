import { FieldDefinition } from '../../types';
import { extractSectionContent } from '../../util/sectionContent';

/**
 * Returns the labels of mandatory (non-title) fields that are empty for an
 * entity, given its frontmatter and its generated content (content above
 * the preserved-section marker, so user notes below it are never
 * mistaken for a section field's value).
 */
export function findMissingMandatoryFields(
	fields: FieldDefinition[],
	frontmatter: Record<string, unknown> | undefined,
	generatedContent: string
): string[] {
	const missing: string[] = [];

	for (const f of fields) {
		if (!f.mandatory || f.display === 'title') continue;

		if (f.display === 'section') {
			if (!extractSectionContent(generatedContent, f.label)) missing.push(f.label);
			continue;
		}

		const val = frontmatter?.[f.key];
		const str = typeof val === 'string' ? val.trim() : '';
		if (!str) missing.push(f.label);
	}

	return missing;
}
