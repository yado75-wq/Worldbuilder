import { Timepoint, TimeframeValue, parseTimepoint, parseTimeframeValue, serializeTimepoint, serializeTimeframeValue } from './TimeframeSyntax';

/**
 * The widget's own editing state for one `timeframe` field (TIME_DESIGN.md
 * §1): a Start side, a "point in time" checkbox, and an End side that only
 * matters when unchecked. `startRaw`/`endRaw` are whatever the user has
 * typed — full §2 timepoint syntax (a bare number, `∞`/`-∞`, a bare
 * `[[Milestone]]`, or a full `(offset, unit, [[Anchor]])` tuple) — not
 * decomposed into separate offset/unit/anchor inputs; the anchor picker
 * (EntityFormModal.ts) is an assist that inserts a starter tuple into this
 * text rather than a structurally separate control.
 */
export interface TimeframeFieldInput {
	point: boolean;
	startRaw: string;
	endRaw: string;
}

export function emptyTimeframeFieldInput(): TimeframeFieldInput {
	return { point: true, startRaw: '', endRaw: '' };
}

/**
 * Composes the widget's current draft into the single quoted frontmatter
 * value (§2), via TimeframeSyntax.ts's own `serializeTimeframeValue` — or
 * `null` when there isn't enough entered yet to produce a value at all, in
 * which case the caller should omit the frontmatter key entirely (an
 * entirely-unset timepoint, §2's "absent" case), not write something the
 * resolution check would flag as malformed for a field the user simply
 * hasn't started filling in.
 *
 * Only reaches for `serializeTimeframeValue` when BOTH sides parse
 * successfully, so canonical formatting only ever replaces input that
 * TimeframeSyntax.ts itself already considers valid. If a side doesn't
 * parse, the raw text the user typed is preserved as-is rather than
 * silently dropped or blocked (§0: "report, don't block") — the next
 * resolution check (§6) is what actually surfaces the problem as a
 * `malformed-value`, not this widget.
 */
export function composeTimeframeValue(input: TimeframeFieldInput): string | null {
	const startText = input.startRaw.trim();
	if (!startText) return null;

	const endText = input.point ? startText : input.endRaw.trim();
	if (!input.point && !endText) return null;

	const startParsed = parseTimepoint(startText);
	const endParsed = input.point ? startParsed : parseTimepoint(endText);

	if (startParsed.ok && endParsed.ok) {
		const value: TimeframeValue = { kind: 'interval', start: startParsed.value, end: endParsed.value };
		return serializeTimeframeValue(value);
	}

	return `(${startText}, ${endText})`;
}

/**
 * The inverse of `composeTimeframeValue`, for prefilling the widget when
 * editing an entity that already has a stored value. `point` is a widget
 * editing convenience only — determined by whether Start and End serialize
 * identically, not by the strict resolved-equality definition of "point"
 * in §3 (which requires resolution, unavailable to this pure module). This
 * matches §3's own framing: the checkbox reflects how the value was last
 * edited, not an authoritative property of the stored data.
 */
export function decomposeTimeframeValue(raw: string | null | undefined): TimeframeFieldInput {
	const text = raw?.trim();
	if (!text) return emptyTimeframeFieldInput();

	const parsed = parseTimeframeValue(text);
	if (!parsed.ok) {
		// Malformed stored value — preserved as-is in Start so nothing is
		// silently lost when re-opening the form; the resolution check (§6)
		// is what actually flags this, not this widget.
		return { point: true, startRaw: text, endRaw: '' };
	}

	if (parsed.value.kind === 'inherit') {
		// Top-level "inherit a whole interval" (§2) isn't decomposable into
		// this widget's Start/End shape — preserved as literal text in Start
		// so it round-trips unchanged if the user doesn't touch it.
		return { point: true, startRaw: `[[${parsed.value.link}]]`, endRaw: '' };
	}

	const startRaw = serializeTimepointForEditing(parsed.value.start);
	const endRaw = serializeTimepointForEditing(parsed.value.end);
	const point = startRaw === endRaw;
	return { point, startRaw, endRaw: point ? '' : endRaw };
}

function serializeTimepointForEditing(tp: Timepoint): string {
	return serializeTimepoint(tp);
}

/**
 * Pulls the first `[[Name]]` reference out of a raw timepoint string, for
 * preselecting the anchor dropdown when reopening the edit form — e.g.
 * `(0, years, [[Founding]])` → `'Founding'`. Returns `''` when there's no
 * link in the text (a plain number, `∞`, or malformed text), matching
 * `buildAnchorDropdown`'s "bare name, no brackets" convention for its
 * `current` parameter.
 */
export function extractAnchorName(raw: string): string {
	const match = raw.match(/\[\[([^\]]+)\]\]/);
	return match?.[1] ?? '';
}
