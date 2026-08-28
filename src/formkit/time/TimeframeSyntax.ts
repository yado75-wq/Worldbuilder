// Parser/serializer for the `timeframe` storage syntax — TIME_DESIGN.md §2.
// Pure, no Obsidian dependency. Parse failures are returned as data
// (ParseResult), never thrown, since an unresolvable/malformed value is a
// normal, reportable state (§6), not an exceptional one.

export type Timepoint =
	| { kind: 'number'; offset: number }
	| { kind: 'milestone'; link: string }
	| { kind: 'infinity'; sign: 1 | -1 }
	| { kind: 'triplet'; offset: number; unit: string | null; anchor: string | null }
	| { kind: 'boundary'; link: string; boundary: 'start' | 'end' };

export type TimeframeValue =
	| { kind: 'interval'; start: Timepoint; end: Timepoint }
	| { kind: 'inherit'; link: string };

export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

const STRICT_NUMBER = /^-?\d+(\.\d+)?$/;
const BARE_LINK = /^\[\[([^\]]+)\]\]$/;
const BOUNDARY_LINK = /^\[\[([^\]]+)\]\]:(start|end)$/;

/**
 * Splits `text` on commas that sit at nesting depth 0, treating both
 * `(`/`)` and `[[`/`]]` as depth-changing. A single combined counter is
 * sufficient — splitting only needs to know "inside some bracket or not,"
 * not which bracket type — so a wikilink title containing its own parens
 * or commas (e.g. `[[Founding (Year One)]]`) is still handled correctly
 * without needing to track bracket types separately.
 */
function splitTopLevel(text: string): { parts: string[]; balanced: boolean } {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	let i = 0;

	while (i < text.length) {
		const ch = text[i];
		const two = text.slice(i, i + 2);

		if (ch === '(') {
			depth++;
			current += ch;
			i++;
		} else if (ch === ')') {
			depth--;
			current += ch;
			i++;
		} else if (two === '[[') {
			depth++;
			current += two;
			i += 2;
		} else if (two === ']]') {
			depth--;
			current += two;
			i += 2;
		} else if (ch === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			i++;
		} else {
			current += ch;
			i++;
		}
	}

	parts.push(current.trim());
	return { parts, balanced: depth === 0 };
}

export function parseTimepoint(raw: string): ParseResult<Timepoint> {
	const text = raw.trim();

	if (text === '∞' || text === '+∞') return { ok: true, value: { kind: 'infinity', sign: 1 } };
	if (text === '-∞') return { ok: true, value: { kind: 'infinity', sign: -1 } };

	const boundaryMatch = text.match(BOUNDARY_LINK);
	if (boundaryMatch) {
		const link = boundaryMatch[1];
		const boundary = boundaryMatch[2];
		if (link && (boundary === 'start' || boundary === 'end')) {
			return { ok: true, value: { kind: 'boundary', link, boundary } };
		}
	}

	const bareLinkMatch = text.match(BARE_LINK);
	if (bareLinkMatch?.[1]) {
		return { ok: true, value: { kind: 'milestone', link: bareLinkMatch[1] } };
	}

	if (text.startsWith('(') && text.endsWith(')')) {
		const { parts, balanced } = splitTopLevel(text.slice(1, -1));
		if (!balanced) {
			return { ok: false, error: `Unbalanced brackets in timepoint: "${raw}"` };
		}
		if (parts.length !== 3) {
			return {
				ok: false,
				error: `A parenthesized timepoint must be a triplet (offset, unit, anchor) with exactly 2 commas — found ${parts.length - 1}: "${raw}"`,
			};
		}

		const [offsetPart, unitPart, anchorPart] = parts as [string, string, string];
		if (!STRICT_NUMBER.test(offsetPart)) {
			return { ok: false, error: `Triplet offset must be a signed number — got "${offsetPart}" in: "${raw}"` };
		}

		const unit = unitPart.length > 0 ? unitPart : null;

		let anchor: string | null = null;
		if (anchorPart.length > 0) {
			const anchorMatch = anchorPart.match(BARE_LINK);
			if (!anchorMatch?.[1]) {
				return { ok: false, error: `Triplet anchor must be a [[Link]] or empty — got "${anchorPart}" in: "${raw}"` };
			}
			anchor = anchorMatch[1];
		}

		return { ok: true, value: { kind: 'triplet', offset: parseFloat(offsetPart), unit, anchor } };
	}

	if (STRICT_NUMBER.test(text)) {
		return { ok: true, value: { kind: 'number', offset: parseFloat(text) } };
	}

	return { ok: false, error: `Unrecognized timepoint: "${raw}"` };
}

export function parseTimeframeValue(raw: string): ParseResult<TimeframeValue> {
	const text = raw.trim();

	const bareLinkMatch = text.match(BARE_LINK);
	if (bareLinkMatch?.[1]) {
		return { ok: true, value: { kind: 'inherit', link: bareLinkMatch[1] } };
	}

	if (text.startsWith('(') && text.endsWith(')')) {
		const { parts, balanced } = splitTopLevel(text.slice(1, -1));
		if (!balanced) {
			return { ok: false, error: `Unbalanced brackets in timeframe value: "${raw}"` };
		}
		if (parts.length !== 2) {
			return {
				ok: false,
				error: `A timeframe interval must have exactly 1 top-level comma (start, end) — found ${parts.length - 1}: "${raw}"`,
			};
		}

		const [startPart, endPart] = parts as [string, string];
		const startResult = parseTimepoint(startPart);
		if (!startResult.ok) return startResult;
		const endResult = parseTimepoint(endPart);
		if (!endResult.ok) return endResult;

		return { ok: true, value: { kind: 'interval', start: startResult.value, end: endResult.value } };
	}

	return { ok: false, error: `Unrecognized timeframe value: "${raw}"` };
}

function formatOffset(offset: number): string {
	return String(offset);
}

export function serializeTimepoint(tp: Timepoint): string {
	switch (tp.kind) {
		case 'number':
			return formatOffset(tp.offset);
		case 'milestone':
			return `[[${tp.link}]]`;
		case 'infinity':
			return tp.sign === 1 ? '∞' : '-∞';
		case 'boundary':
			return `[[${tp.link}]]:${tp.boundary}`;
		case 'triplet':
			return `(${formatOffset(tp.offset)}, ${tp.unit ?? ''}, ${tp.anchor ? `[[${tp.anchor}]]` : ''})`;
	}
}

export function serializeTimeframeValue(value: TimeframeValue): string {
	if (value.kind === 'inherit') return `[[${value.link}]]`;
	return `(${serializeTimepoint(value.start)}, ${serializeTimepoint(value.end)})`;
}
