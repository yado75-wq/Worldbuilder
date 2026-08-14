/**
 * Multiselect storage is always string[].
 * text kind: plain labels; link kind: "[[Name]]" strings.
 * Save order = source list order (not click order).
 */

export function parseStoredMultiselect(value: unknown): string[] {
	if (value == null) return [];
	if (Array.isArray(value)) {
		return value
			.map(v => (typeof v === 'string' ? v.trim() : String(v).trim()))
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		const t = value.trim();
		if (!t) return [];
		// Single string fallback (unlikely)
		return [t];
	}
	return [];
}

/** Keep selected items in the order they appear in `sourceOrder`. */
export function orderSelectedBySource(selected: string[], sourceOrder: string[]): string[] {
	const set = new Set(selected);
	return sourceOrder.filter(item => set.has(item));
}

export function sourceOrderForField(
	field: { multiKind?: 'text' | 'link'; options?: string[]; linkTypes?: string[] },
	linkGroups?: { entityType: string; names: string[] }[]
): string[] {
	if (field.multiKind === 'link' && linkGroups) {
		const ordered: string[] = [];
		for (const g of linkGroups) {
			for (const name of g.names) {
				ordered.push(`[[${name}]]`);
			}
		}
		return ordered;
	}
	return field.options ?? [];
}

export function formatMultiselectFrontmatterLine(key: string, values: string[]): string {
	if (values.length === 0) return '';
	const lines = values.map(v => `  - "${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
	return `${key}:\n${lines.join('\n')}`;
}

export function formatMultiselectPropertyBullet(label: string, values: string[]): string {
	if (values.length === 0) return '';
	const items = values.map(v => `  - ${v}`).join('\n');
	return `- **${label}:**\n${items}`;
}