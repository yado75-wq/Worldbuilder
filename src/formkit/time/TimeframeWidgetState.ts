import { Timepoint, TimeframeValue, parseTimepoint, parseTimeframeValue, serializeTimeframeValue } from './TimeframeSyntax';

/**
 * One side (Start or End) of the widget's editing state, decomposed into
 * the pieces a user actually thinks in, none of which is raw §2 storage
 * syntax:
 *   - a plain integer offset
 *   - an optional anchor
 *   - `useAnchorEnd`: reference the anchor's *end* instead of its start
 *     (§2's `boundary` Timepoint kind — `[[Entity]]:end`). Only meaningful
 *     with an anchor set; that form has no offset in the data model at
 *     all, so offset is ignored (and disabled in the UI) whenever this is
 *     true.
 *   - `unbounded`: this side is `∞`/`-∞` (§2's `infinity` kind). Mutually
 *     exclusive with offset/anchor/useAnchorEnd — infinity carries neither
 *     in the data model. The sign is never chosen directly: Start can only
 *     ever be unbounded as `-∞` (an unbounded future start makes no
 *     sense), End only ever as `∞`; which one applies is inferred from
 *     which side this is, not stored here.
 *
 * There is no `unit` field: WorldBuilder has no real unit system and no
 * calendar, so a per-timepoint free-text unit would invite a false sense
 * of precision it can't back up. The world's single configured `time_unit`
 * (§4) is shown as a fixed, non-editable label instead.
 */
export interface TimepointInput {
	offset: string;
	anchor: string;
	useAnchorEnd: boolean;
	unbounded: boolean;
}

export function emptyTimepointInput(): TimepointInput {
	return { offset: '', anchor: '', useAnchorEnd: false, unbounded: false };
}

/**
 * A `timeframe` field's full editing state. `mode: 'inherit'` is the
 * top-level "same as another entity" form (§2's bare `[[Entity]]` — the
 * *entire* stored value, meaning "copy that entity's whole interval, both
 * ends"). This is a fundamentally different shape from `'interval'` mode's
 * Start/End pair, not something expressible by anchoring one Timepoint
 * inside it — hence a distinct top-level mode rather than another Timepoint
 * option.
 */
export interface TimeframeFieldInput {
	mode: 'interval' | 'inherit';
	inheritLink: string;
	point: boolean;
	start: TimepointInput;
	end: TimepointInput;
}

export function emptyTimeframeFieldInput(): TimeframeFieldInput {
	return {
		mode: 'interval',
		inheritLink: '',
		point: true,
		start: emptyTimepointInput(),
		end: emptyTimepointInput(),
	};
}

/** A side counts as started once it's unbounded, or has an offset, or has an anchor picked with no offset typed yet (defaults to 0, see composeTimepointText). */
function isTimepointFilled(input: TimepointInput): boolean {
	return input.unbounded || input.offset.trim().length > 0 || input.anchor.trim().length > 0;
}

function stripLinkBrackets(link: string): string {
	return link.replace(/^\[\[|\]\]$/g, '');
}

/**
 * Builds one side's raw §2 syntax fragment from its decomposed pieces —
 * internal to this module; never shown to the user directly. A numeric
 * offset is always promoted into an explicit `(offset, worldUnit, anchor)`
 * triplet, even with no anchor — storing the unit explicitly now, even
 * though nothing reads it back yet, is cheap and keeps the door open for
 * real unit handling later without a migration.
 *
 * `unboundedSign` is fixed by the caller based on which side this is
 * (Start always `-1`, End always `1`) — this module never lets the sign be
 * chosen freely, matching that a side can genuinely only be unbounded in
 * one direction.
 */
function composeTimepointText(input: TimepointInput, worldUnit: string, unboundedSign: 1 | -1): string {
	if (input.unbounded) return unboundedSign === 1 ? '∞' : '-∞';

	const anchor = input.anchor.trim();
	let offset = input.offset.trim();

	if (!offset && !anchor) return '';

	if (input.useAnchorEnd && anchor) {
		// §2's `boundary` form has no offset slot at all — exact reference
		// to the anchor's end, nothing layered on top of it.
		return `${anchor}:end`;
	}

	// An anchor picked with no explicit offset typed defaults to 0 — "at
	// that anchor", the same as a bare offset of 0.
	if (!offset && anchor) offset = '0';

	return `(${offset}, ${worldUnit}, ${anchor})`;
}

/**
 * Composes the widget's current draft into the single quoted frontmatter
 * value (§2), via TimeframeSyntax.ts's own `serializeTimeframeValue` — or
 * `null` when there isn't enough entered yet (caller should omit the
 * frontmatter key entirely rather than write something the resolution
 * check would flag as malformed for a field the user simply hasn't
 * started filling in).
 *
 * Only reaches for `serializeTimeframeValue` when both sides parse
 * successfully, so canonical formatting only ever replaces input that
 * TimeframeSyntax.ts itself already considers valid. If a side doesn't
 * parse (a hand-edited leftover, etc.), the composed text is preserved
 * as-is rather than silently dropped or blocked (§0: "report, don't
 * block") — the next resolution check (§6) is what surfaces the problem
 * as a `malformed-value`, not this widget.
 *
 * `input.point`'s Start can never carry `unbounded` — enforced here
 * defensively (not just by the UI never offering the option) so a stale
 * or out-of-sync state object can never produce a degenerate `(∞, ∞)`
 * point. Likewise, Start and End can never *both* be unbounded — an
 * interval spanning all of time either direction says nothing at all, so
 * if both are somehow set (only reachable via already-corrupted legacy
 * data, since the UI itself — EntityFormModal.ts's mutual-exclusion
 * dropdown rebuilding — never lets both be picked at once), End's
 * `unbounded` is dropped here too.
 */
export function composeTimeframeValue(input: TimeframeFieldInput, worldUnit: string): string | null {
	if (input.mode === 'inherit') {
		const link = stripLinkBrackets(input.inheritLink.trim());
		if (!link) return null;
		return serializeTimeframeValue({ kind: 'inherit', link });
	}

	const start = input.point ? { ...input.start, unbounded: false } : input.start;
	const end = !input.point && start.unbounded && input.end.unbounded
		? { ...input.end, unbounded: false }
		: input.end;

	if (!isTimepointFilled(start)) return null;
	if (!input.point && !isTimepointFilled(end)) return null;

	const startText = composeTimepointText(start, worldUnit, -1);
	const endText = input.point ? startText : composeTimepointText(end, worldUnit, 1);

	const startParsed = parseTimepoint(startText);
	const endParsed = input.point ? startParsed : parseTimepoint(endText);

	if (startParsed.ok && endParsed.ok) {
		const value: TimeframeValue = { kind: 'interval', start: startParsed.value, end: endParsed.value };
		return serializeTimeframeValue(value);
	}

	return `(${startText}, ${endText})`;
}

/** The inverse of composeTimepointText — decomposes a parsed Timepoint back into offset/anchor/useAnchorEnd/unbounded. */
function decomposeTimepoint(tp: Timepoint): TimepointInput {
	switch (tp.kind) {
		case 'number':
			return { offset: String(tp.offset), anchor: '', useAnchorEnd: false, unbounded: false };
		case 'infinity':
			return { offset: '', anchor: '', useAnchorEnd: false, unbounded: true };
		case 'triplet':
			return {
				offset: String(tp.offset),
				anchor: tp.anchor ? `[[${tp.anchor}]]` : '',
				useAnchorEnd: false,
				unbounded: false,
			};
		case 'milestone':
			// Sugar for offset 0 relative to that entity's start (§2, §7.1) —
			// decomposed the same as an explicit (0, worldUnit, [[Name]])
			// triplet. Recomposing produces that canonical triplet form
			// instead of the original bare-link shorthand — a
			// meaning-preserving normalization (the resolver treats them
			// identically), not a behavior change.
			return { offset: '0', anchor: `[[${tp.link}]]`, useAnchorEnd: false, unbounded: false };
		case 'boundary':
			// boundary:'start' is numerically identical to a plain anchor
			// (both resolve to the target's start) — decomposed the same
			// way, normalizing to the triplet form on recompose. Only
			// boundary:'end' needs the dedicated flag; it's the one shape a
			// plain anchor can't express.
			return {
				offset: '0',
				anchor: `[[${tp.link}]]`,
				useAnchorEnd: tp.boundary === 'end',
				unbounded: false,
			};
	}
}

/**
 * The inverse of `composeTimeframeValue`, for prefilling the widget when
 * editing an entity that already has a stored value. `point` is a widget
 * editing convenience only — determined by whether Start and End decompose
 * identically, not by the strict resolved-equality definition of "point"
 * in §3 (which requires resolution, unavailable to this pure module).
 */
export function decomposeTimeframeValue(raw: string | null | undefined): TimeframeFieldInput {
	const text = raw?.trim();
	if (!text) return emptyTimeframeFieldInput();

	const parsed = parseTimeframeValue(text);
	if (!parsed.ok) {
		// Malformed stored value — preserved as-is in Start's offset slot so
		// nothing is silently lost when reopening the form; the resolution
		// check (§6) is what actually flags this, not this widget.
		return {
			mode: 'interval',
			inheritLink: '',
			point: true,
			start: { offset: text, anchor: '', useAnchorEnd: false, unbounded: false },
			end: emptyTimepointInput(),
		};
	}

	if (parsed.value.kind === 'inherit') {
		return {
			mode: 'inherit',
			inheritLink: `[[${parsed.value.link}]]`,
			point: true,
			start: emptyTimepointInput(),
			end: emptyTimepointInput(),
		};
	}

	const start = decomposeTimepoint(parsed.value.start);
	const end = decomposeTimepoint(parsed.value.end);

	// An unbounded side is never treated as "the same" as the other side,
	// regardless of what the equality check below would otherwise say — a
	// point can never be unbounded at all (§1), and `unbounded` alone
	// can't distinguish -∞ from ∞ (neither carries a sign; the sign is
	// inferred purely from which side it's on, see composeTimepointText),
	// so two *opposite* infinities would otherwise decompose into
	// byte-for-byte identical objects and be wrongly read as a point.
	const point =
		!start.unbounded &&
		!end.unbounded &&
		start.offset === end.offset &&
		start.anchor === end.anchor &&
		start.useAnchorEnd === end.useAnchorEnd;

	return { mode: 'interval', inheritLink: '', point, start, end: point ? emptyTimepointInput() : end };
}
