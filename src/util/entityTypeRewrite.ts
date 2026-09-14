/**
 * Pure rewrites for rename-entity-type (template set files + note tags).
 * No vault I/O — command layer applies results.
 */

/** Replace an exact type segment in a field type cell (link / multiselect:link chains). */
export function replaceTypeInFieldTypeSpec(
	typeRaw: string,
	oldType: string,
	newType: string
): string {
	const trimmed = typeRaw.trim();
	const lower = trimmed.toLowerCase();

	if (lower.startsWith('link:')) {
		const colon = trimmed.indexOf(':');
		const prefix = trimmed.slice(0, colon + 1);
		const chain = trimmed.slice(colon + 1);
		return prefix + replaceTypeInChain(chain, oldType, newType);
	}

	if (lower.startsWith('multiselect:')) {
		const firstColon = trimmed.indexOf(':');
		const after = trimmed.slice(firstColon + 1);
		const kindSep = after.indexOf(':');
		if (kindSep === -1) return trimmed;
		const kind = after.slice(0, kindSep).trim().toLowerCase();
		if (kind !== 'link') return trimmed;
		const head = trimmed.slice(0, firstColon + 1) + after.slice(0, kindSep + 1);
		const payload = after.slice(kindSep + 1);
		return head + replaceTypeInChain(payload, oldType, newType);
	}

	return trimmed;
}

function replaceTypeInChain(chain: string, oldType: string, newType: string): string {
	return chain
		.split('>')
		.map(seg => (seg.trim() === oldType ? newType : seg.trim()))
		.filter((seg, i, arr) => !(seg === '' && i > 0 && i < arr.length - 1))
		.join('>');
}

/**
 * Rewrite type column (4th pipe field) in *_Fields.md body lines.
 * Does not touch key/label text.
 */
export function rewriteFieldsFileContent(
	raw: string,
	oldType: string,
	newType: string
): { content: string; replacements: number } {
	let replacements = 0;
	const lines = raw.split(/\r?\n/);
	const out = lines.map(line => {
		const listPrefix = line.match(/^([-*]\s*)/)?.[1] ?? '';
		const withoutList = listPrefix ? line.slice(listPrefix.length) : line;
		const trimmedLine = withoutList.trim();
		if (!trimmedLine || trimmedLine.startsWith('#')) return line;

		const parts = withoutList.split('|');
		if (parts.length < 4) return line;

		const typeCell = parts[3] ?? '';
		const rewritten = replaceTypeInFieldTypeSpec(typeCell, oldType, newType);
		if (rewritten === typeCell.trim()) return line;

		replacements += 1;
		parts[3] = ` ${rewritten} `;
		return listPrefix + parts.map(p => p.trim()).join(' | ');
	});
	return { content: out.join('\n'), replacements };
}

/** Rewrite entity-type column in folder-rules.md; folder column unchanged. */
export function rewriteFolderRulesContent(
	raw: string,
	oldType: string,
	newType: string
): { content: string; replacements: number } {
	let replacements = 0;
	const lines = raw.split(/\r?\n/);
	const out = lines.map(line => {
		const listPrefix = line.match(/^([-*]\s*)/)?.[1] ?? '';
		const withoutList = listPrefix ? line.slice(listPrefix.length) : line;
		const cleaned = withoutList.trim();
		if (!cleaned || cleaned.startsWith('#')) return line;

		const parts = cleaned.split('|').map(s => s.trim());
		const entityType = parts[0];
		const folder = parts[1];
		if (!entityType || !folder) return line;
		if (entityType !== oldType) return line;

		replacements += 1;
		return `${listPrefix}${newType} | ${folder}`;
	});
	return { content: out.join('\n'), replacements };
}

/**
 * Retag in YAML frontmatter only: tags list item equal to oldTag → newTag.
 * Does not rewrite note body prose.
 */
export function retagNoteFrontmatter(
	content: string,
	oldTag: string,
	newTag: string
): { content: string; changed: boolean } {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm || fm[1] === undefined) return { content, changed: false };

	const body = fm[1];
	const oldEsc = escapeRegExp(oldTag);
	let changed = false;
	let nextBody = body;

	nextBody = nextBody.replace(
		new RegExp(`^([ \\t]*-[ \\t]*)${oldEsc}[ \\t]*$`, 'gim'),
		(_m, prefix: string) => {
			changed = true;
			return `${prefix}${newTag}`;
		}
	);

	nextBody = nextBody.replace(
		new RegExp(`(tags:\\s*\\[[^\\]]*)\\b${oldEsc}\\b`, 'i'),
		(_m, prefix: string) => {
			changed = true;
			return `${prefix}${newTag}`;
		}
	);

	if (!changed) return { content, changed: false };
	const rest = content.slice(fm[0].length);
	const nl = content.startsWith('---\r\n') ? '\r\n' : '\n';
	return {
		content: `---${nl}${nextBody}${nl}---${rest}`,
		changed: true,
	};
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function fieldsFileName(typeStem: string): string {
	return `${typeStem}_Fields.md`;
}

export function isReservedEntityType(typeStem: string): boolean {
	return typeStem.trim().toLowerCase() === 'worldmeta';
}
