// Pure, Obsidian-free helpers for working with generated entity content.

/** Escapes a string for safe use inside a `new RegExp(...)` construction. */
export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the content under a `## <label>` heading in generated markdown
 * (e.g. "## History\nSome text" -> "Some text"), stopping at the next H2
 * heading or the end of the string. Returns '' if the heading isn't found
 * or has no content.
 */
export function extractSectionContent(content: string, label: string): string {
	const match = content.match(new RegExp(`## ${escapeRegExp(label)}\\n([\\s\\S]*?)(?=\\n## |$)`));
	return match?.[1]?.trim() ?? '';
}
