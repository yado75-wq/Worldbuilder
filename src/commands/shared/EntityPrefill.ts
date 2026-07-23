import { App, TFile } from 'obsidian';
import { FieldDefinition } from '../../types';
import { PRESERVED_SECTION_MARKER } from '../../util/PreservedSection';
import { extractSectionContent } from '../../util/sectionContent';

/**
 * Reads an existing entity file's current field values back out, keyed by
 * field key — used both to prefill the edit form (EditEntityCommand.ts)
 * and, as a plain `Record<string, string>`, directly as `buildEntityContent`'s
 * `data` parameter when regenerating a file's content without going
 * through the form at all (RefreshAllTimeframesCommand.ts). Both usages
 * work off the same shape because an empty string and `null` are handled
 * identically by `buildEntityContent`'s own field filters — no conversion
 * needed between "prefill a form" and "data to build content from".
 */
export async function buildFieldValues(
	app: App,
	file: TFile,
	fields: FieldDefinition[]
): Promise<Record<string, string>> {
	const values: Record<string, string> = {};
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	const content = await app.vault.read(file);
	const generatedContent = content.split(PRESERVED_SECTION_MARKER)[0] ?? content;

	for (const f of fields) {
		if (f.display === 'section') {
			values[f.key] = extractSectionContent(generatedContent, f.label);
		} else if (f.type === 'link') {
			// Strip [[ ]] for display in dropdown
			const val: unknown = frontmatter?.[f.key];
			const raw = typeof val === 'string' ? val : '';
			values[f.key] = raw.replace(/^\[\[|\]\]$/g, '');
		} else if (f.display === 'title') {
			// Use frontmatter name if present, fall back to filename
			const val: unknown = frontmatter?.['name'];
			values[f.key] = typeof val === 'string' && val.trim()
				? val.trim()
				: file.basename;
		} else {
			// Covers `timeframe` fields too — the stored value is already
			// the exact raw syntax string, no bracket-stripping needed.
			const val: unknown = frontmatter?.[f.key];
			values[f.key] = typeof val === 'string' ? val : '';
		}
	}

	return values;
}
