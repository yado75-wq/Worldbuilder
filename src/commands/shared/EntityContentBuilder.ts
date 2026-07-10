import { FieldDefinition } from '../../types';
import { PRESERVED_SECTION_MARKER } from '../../util/PreservedSection';

// Pure string builders — no Obsidian API dependency. Deliberately split out
// of EntityContent.ts (which also has buildLinkCandidates, needing `app`)
// so these can be unit tested without mocking Obsidian.

export const DEFAULT_ENTITY_NOTES = '## Notes\n_Your notes here survive entity refresh._';

export function buildEntityContent(
	fields: FieldDefinition[],
	data: Record<string, string | null>,
	entityType: string,
	title: string,
	preservedSection: string
): string {
	const tag = entityType.toLowerCase();

	const frontmatterProps = fields
		.filter(f => f.display === 'property' && data[f.key])
		.map(f => `${f.key}: "${data[f.key] ?? ''}"`)
		.join('\n');

	const propertiesBlock = fields
		.filter(f => f.display === 'property' && data[f.key])
		.map(f => `- **${f.label}:** ${data[f.key] ?? ''}`)
		.join('\n');

	const sectionsBlock = fields
		.filter(f => f.display === 'section' && data[f.key])
		.map(f => `\n## ${f.label}\n${data[f.key] ?? ''}`)
		.join('\n');

	return `---
tags:
  - ${tag}
name: "${title}"
${frontmatterProps}
---

# ${title}

${propertiesBlock}
${sectionsBlock}

${PRESERVED_SECTION_MARKER}

${preservedSection}`;
}

export function buildMinimalEntityContent(
	entityType: string,
	title: string,
	preservedSection: string
): string {
	return `---
tags:
  - ${entityType.toLowerCase()}
name: "${title}"
---

# ${title}

${PRESERVED_SECTION_MARKER}

${preservedSection}`;
}
