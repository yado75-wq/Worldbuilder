// Shared "preserved section" convention: everything above
// PRESERVED_SECTION_MARKER is regenerated on refresh/edit; everything below
// it is the user's own content and survives. Used by both the world
// dashboard and entity files so they behave the same way.

export const PRESERVED_SECTION_MARKER =
	'<!-- AUTO-GENERATED: everything above this line is overwritten on refresh -->';

/**
 * Pulls the user-owned content out of an existing file so it can be carried
 * forward into regenerated content.
 *
 * - If the marker is present, returns whatever follows it (or defaultSection
 *   if that's empty).
 * - If the marker is absent — the file predates this feature, or was
 *   created outside the plugin — the whole body after frontmatter is
 *   treated as user content, so the first refresh/edit after upgrading
 *   never silently discards it.
 */
export function extractPreservedSection(existingContent: string, defaultSection: string): string {
	const markerIndex = existingContent.indexOf(PRESERVED_SECTION_MARKER);
	if (markerIndex !== -1) {
		const afterMarker = existingContent.slice(markerIndex + PRESERVED_SECTION_MARKER.length).trim();
		return afterMarker.length > 0 ? afterMarker : defaultSection;
	}

	const bodyMatch = existingContent.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	const legacyBody = bodyMatch?.[1]?.trim() ?? '';
	return legacyBody.length > 0 ? legacyBody : defaultSection;
}
