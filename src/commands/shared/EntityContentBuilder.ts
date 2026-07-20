import { FieldDefinition } from '../../types';
import { PRESERVED_SECTION_MARKER } from '../../util/PreservedSection';

// Pure string builders — no Obsidian API dependency. Deliberately split out
// of EntityContent.ts (which also has buildLinkCandidates, needing `app`)
// so these can be unit tested without mocking Obsidian.

export const DEFAULT_ENTITY_NOTES = '## Notes\n_Your notes here survive entity refresh._';

/**
 * A resolution-aware caller's best-effort read on a `timeframe` value, for
 * display in its generated section (TIME_DESIGN.md §8). Optional because
 * this module is pure — it can't resolve anchors itself (that needs vault
 * access, TimeframeResolver.ts) — so callers that haven't attempted
 * resolution yet (e.g. right after creating an entity, before other
 * entities necessarily exist) simply omit it.
 */
export interface TimeframeResolution {
	ok: boolean;
	/** Human-readable resolved value, set when `ok` is true. */
	display?: string;
}

export function buildEntityContent(
	fields: FieldDefinition[],
	data: Record<string, string | null>,
	entityType: string,
	title: string,
	preservedSection: string,
	timeframeResolutions?: Record<string, TimeframeResolution>
): string {
	const tag = entityType.toLowerCase();

	const frontmatterProps = fields
		.filter(f => f.display === 'property' && data[f.key])
		.map(f => `${f.key}: "${data[f.key] ?? ''}"`)
		.join('\n');

	// A `timeframe` field's raw value is excluded here — its generated
	// section below (§8) is what makes it referenceable, and repeating the
	// raw stored expression in this plain bullet list too would just
	// duplicate that, not add anything.
	const propertiesBlock = fields
		.filter(f => f.display === 'property' && f.type !== 'timeframe' && data[f.key])
		.map(f => `- **${f.label}:** ${data[f.key] ?? ''}`)
		.join('\n');

	const sectionsBlock = fields
		.filter(f => f.display === 'section' && data[f.key])
		.map(f => `## ${f.label}\n${data[f.key] ?? ''}`)
		.join('\n\n');

	// §8: a `timeframe` field's section is generated unconditionally,
	// regardless of `data[f.key]` — the heading is what makes the field
	// linkable at all (`[[Entity#Label]]`), so it must exist as a stable
	// link target even before (or if never) the value resolves. This is
	// what makes hot-create (§1) safe: a hot-created stub is immediately
	// linkable via its own generated section the moment it exists.
	const timeframeSectionsBlock = fields
		.filter(f => f.type === 'timeframe')
		.map(f => buildTimeframeSection(f, data[f.key], timeframeResolutions?.[f.key]))
		.join('\n\n');

	// Only chunks that actually have content contribute a blank-line
	// separator. Previously each of these three occupied a fixed template
	// slot regardless of emptiness, and buildTimeframeSection additionally
	// carried its own leading blank line — an entity with, say, only a
	// `timeframe` field and nothing else would stack several blank lines
	// where the empty properties/sections blocks used to sit.
	const bodyChunks = [propertiesBlock, sectionsBlock, timeframeSectionsBlock].filter(chunk => chunk.length > 0);

	const frontmatter = [
		'tags:',
		`  - ${tag}`,
		`name: "${title}"`,
		...(frontmatterProps ? [frontmatterProps] : []),
	].join('\n');

	return [
		`---\n${frontmatter}\n---`,
		`# ${title}`,
		...bodyChunks,
		PRESERVED_SECTION_MARKER,
		preservedSection,
	].join('\n\n');
}

/**
 * Builds a `timeframe` field's generated section (§8): plain, factual
 * content — the raw stored expression and/or a resolved value — never
 * composed prose. WorldBuilder never writes a sentence like "5 years after
 * the war ended" itself; that phrasing is the *linking* author's job via
 * Obsidian's alias syntax (`[[Entity#Label|however they want it to read]]`).
 *
 * Always renders, even when unset or unresolved, per §8's "best-effort
 * content, always" — a link targets the heading, not any value inside it,
 * so the heading must be a stable target from the moment it exists.
 */
export function buildTimeframeSection(
	field: FieldDefinition,
	raw: string | null | undefined,
	resolution?: TimeframeResolution
): string {
	const trimmedRaw = raw?.trim();
	const lines: string[] = [];

	if (!trimmedRaw) {
		lines.push('_Not yet set._');
	} else {
		// The raw internal storage syntax isn't shown — it's implementation
		// detail, not something a reader needs. Referenced entities are
		// listed as a plain (non-code) line so Obsidian actually parses and
		// links them (a `[[Link]]` inside a backtick span renders as
		// verbatim text, never as a link).
		const linkedEntities = extractLinkedEntities(trimmedRaw);
		if (linkedEntities.length > 0) {
			lines.push(`**References:** ${linkedEntities.map(name => `[[${name}]]`).join(', ')}`);
		}

		if (resolution) {
			lines.push(
				resolution.ok ? `**Resolved:** ${resolution.display ?? ''}` : '**Resolved:** <unresolved>'
			);
		} else if (linkedEntities.length === 0) {
			// No anchors involved, so this value is already absolute — it IS
			// its own resolved form, no lookup needed, so it's shown under
			// the same "Resolved" label a real resolution would use rather
			// than introducing a third, redundant label.
			lines.push(`**Resolved:** ${trimmedRaw}`);
		}
		// linkedEntities.length > 0 with no `resolution` supplied: References
		// alone is what's shown — a real resolved value needs vault access
		// this pure module doesn't have (see TimeframeResolution's doc
		// comment); a resolution-aware caller can supply it once wired up.
	}

	return `## ${field.label}\n${lines.join('\n')}`;
}

/** Every distinct `[[Name]]` referenced in a raw timeframe value, in first-seen order. */
function extractLinkedEntities(raw: string): string[] {
	const seen = new Set<string>();
	const names: string[] = [];

	for (const match of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
		const name = match[1];
		if (name && !seen.has(name)) {
			seen.add(name);
			names.push(name);
		}
	}

	return names;
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
