import { App, getAllTags } from 'obsidian';
import { FieldDefinition, WorldInfo } from '../../types';
import { PRESERVED_SECTION_MARKER } from '../../util/PreservedSection';

export const DEFAULT_ENTITY_NOTES = '## Notes\n_Your notes here survive entity refresh._';

export function buildLinkCandidates(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[]
): Record<string, string[]> {
	const candidates: Record<string, string[]> = {};

	for (const f of fields) {
		if (f.type !== 'link' || !f.linkFolder) continue;

		const folderPath = `${world.path}/${f.linkFolder}`;
		const files = app.vault.getFiles().filter(file => {
			if (!file.path.startsWith(folderPath + '/')) return false;
			if (file.extension !== 'md') return false;
			if (file.basename === '_index') return false;
			const cache = app.metadataCache.getFileCache(file);
			const tags = getAllTags(cache ?? {}) ?? [];
			return !tags.includes('generic') && !tags.includes('#generic');
		});

		candidates[f.key] = files.map(file => file.basename);

		const current = candidates[f.key];
		if (current !== undefined && current.length === 0 && f.linkFallback) {
			const fallbackPath = `${world.path}/${f.linkFallback}`;
			const fallbackFiles = app.vault.getFiles().filter(file =>
				file.path.startsWith(fallbackPath + '/') &&
				file.extension === 'md' &&
				file.basename !== '_index'
			);
			candidates[f.key] = fallbackFiles.map(file => file.basename);
		}
	}

	return candidates;
}

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
