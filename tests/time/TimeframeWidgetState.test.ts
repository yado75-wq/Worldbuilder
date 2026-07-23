import { describe, expect, it } from 'vitest';
import {
	composeTimeframeValue,
	decomposeTimeframeValue,
	emptyTimeframeFieldInput,
	emptyTimepointInput,
	TimeframeFieldInput,
	TimepointInput,
} from '../../src/time/TimeframeWidgetState';

const YEARS = 'years';

function point(overrides: Partial<TimepointInput>): TimepointInput {
	return { ...emptyTimepointInput(), ...overrides };
}

function input(overrides: Partial<TimeframeFieldInput>): TimeframeFieldInput {
	return { ...emptyTimeframeFieldInput(), ...overrides };
}

describe('composeTimeframeValue — interval mode', () => {
	it('returns null when Start has nothing entered at all', () => {
		expect(composeTimeframeValue(input({ start: point({ offset: '   ' }) }), YEARS)).toBeNull();
	});

	it('mirrors Start into End when "point in time" is checked, wrapping the offset with the world unit', () => {
		const value = composeTimeframeValue(input({ point: true, start: point({ offset: '1200' }) }), YEARS);
		expect(value).toBe('((1200, years, ), (1200, years, ))');
	});

	it('returns null in range mode when End is left entirely blank', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ offset: '1200' }), end: emptyTimepointInput() }),
			YEARS
		);
		expect(value).toBeNull();
	});

	it('produces a bounded range, each side carrying the world unit even with no anchor', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ offset: '1200' }), end: point({ offset: '1250' }) }),
			YEARS
		);
		expect(value).toBe('((1200, years, ), (1250, years, ))');
	});

	it('combines offset, world unit, and anchor into the internal tuple syntax on compose', () => {
		const value = composeTimeframeValue(
			input({
				point: false,
				start: point({ offset: '5', anchor: '[[Founding]]' }),
				end: point({ offset: '10' }),
			}),
			'rok'
		);
		expect(value).toBe('((5, rok, [[Founding]]), (10, rok, ))');
	});

	it('defaults offset to 0 when an anchor is picked with no offset typed', () => {
		const value = composeTimeframeValue(input({ point: true, start: point({ anchor: '[[Founding]]' }) }), YEARS);
		expect(value).toBe('((0, years, [[Founding]]), (0, years, [[Founding]]))');
	});

	it('is considered started by anchor alone, even with a blank offset', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ anchor: '[[A]]' }), end: point({ offset: '5' }) }),
			YEARS
		);
		expect(value).not.toBeNull();
	});

	it('preserves an unparseable hand-edited offset rather than dropping or blocking it', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ offset: 'not valid' }), end: point({ offset: '1250' }) }),
			YEARS
		);
		expect(value).toBe('((not valid, years, ), (1250, years, ))');
	});
});

describe('composeTimeframeValue — unbounded (infinity)', () => {
	it('produces -∞ for an unbounded Start, ignoring offset/anchor', () => {
		const value = composeTimeframeValue(
			input({
				point: false,
				start: point({ unbounded: true, offset: '999', anchor: '[[Ignored]]' }),
				end: point({ offset: '5' }),
			}),
			YEARS
		);
		expect(value).toBe('(-∞, (5, years, ))');
	});

	it('produces ∞ for an unbounded End, ignoring offset/anchor', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ offset: '5' }), end: point({ unbounded: true }) }),
			YEARS
		);
		expect(value).toBe('((5, years, ), ∞)');
	});

	it('is never both sides at once — a spurious both-unbounded state defensively drops End rather than producing (-∞, ∞)', () => {
		const value = composeTimeframeValue(
			input({ point: false, start: point({ unbounded: true }), end: point({ unbounded: true }) }),
			YEARS
		);
		// End is stripped back to fully empty once its unbounded flag is
		// dropped — nothing else was in it — so the whole field reads as
		// not-yet-finished (null), not a malformed write.
		expect(value).toBeNull();
	});

	it('is never applied to a point — defensively stripped even if the state object claims otherwise', () => {
		const value = composeTimeframeValue(input({ point: true, start: point({ unbounded: true }) }), YEARS);
		// unbounded stripped -> start has nothing else filled -> null
		expect(value).toBeNull();
	});
});

describe('composeTimeframeValue — anchor boundary (useAnchorEnd)', () => {
	it('produces the boundary form with no offset, ignoring whatever offset was typed', () => {
		const value = composeTimeframeValue(
			input({
				point: false,
				start: point({ offset: '999', anchor: '[[Coronation]]', useAnchorEnd: true }),
				end: point({ offset: '5' }),
			}),
			YEARS
		);
		expect(value).toBe('([[Coronation]]:end, (5, years, ))');
	});

	it('is ignored (falls back to normal anchor handling) when useAnchorEnd is set but no anchor is chosen', () => {
		const value = composeTimeframeValue(
			input({ point: true, start: point({ offset: '5', useAnchorEnd: true }) }),
			YEARS
		);
		expect(value).toBe('((5, years, ), (5, years, ))');
	});
});

describe('composeTimeframeValue — inherit mode', () => {
	it('returns null when no entity is chosen', () => {
		expect(composeTimeframeValue(input({ mode: 'inherit', inheritLink: '' }), YEARS)).toBeNull();
	});

	it('produces the bare-link inherit form, ignoring Start/End entirely', () => {
		const value = composeTimeframeValue(
			input({ mode: 'inherit', inheritLink: '[[The War]]', start: point({ offset: '999' }) }),
			YEARS
		);
		expect(value).toBe('[[The War]]');
	});
});

describe('decomposeTimeframeValue', () => {
	it('returns an empty, interval, point-mode default for an absent value', () => {
		expect(decomposeTimeframeValue(undefined)).toEqual(emptyTimeframeFieldInput());
		expect(decomposeTimeframeValue(null)).toEqual(emptyTimeframeFieldInput());
		expect(decomposeTimeframeValue('   ')).toEqual(emptyTimeframeFieldInput());
	});

	it('detects a point (equal sides) and checks the box', () => {
		const state = decomposeTimeframeValue('(1945, 1945)');
		expect(state.point).toBe(true);
		expect(state.start.offset).toBe('1945');
	});

	it('detects a genuine range and unchecks the box', () => {
		const state = decomposeTimeframeValue('(1200, 1250)');
		expect(state.point).toBe(false);
		expect(state.start.offset).toBe('1200');
		expect(state.end.offset).toBe('1250');
	});

	it('decomposes an unbounded end into the unbounded flag, not text', () => {
		const state = decomposeTimeframeValue('(1200, ∞)');
		expect(state.point).toBe(false);
		expect(state.end.unbounded).toBe(true);
		expect(state.end.offset).toBe('');
	});

	it('decomposes an unbounded start into the unbounded flag', () => {
		const state = decomposeTimeframeValue('(-∞, 1200)');
		expect(state.start.unbounded).toBe(true);
	});

	it('never reads (-∞, ∞) as a point, even though both sides decompose to byte-for-byte identical objects', () => {
		// The bug this guards: unbounded is a plain boolean with no sign, so
		// -∞ and ∞ decompose to the exact same shape ({offset:'',anchor:'',
		// useAnchorEnd:false,unbounded:true}) — a naive equality check would
		// wrongly conclude "these are the same, must be a point", corrupting
		// the widget on reopen (Point in time checked, Start row emptied).
		const state = decomposeTimeframeValue('(-∞, ∞)');
		expect(state.point).toBe(false);
		expect(state.start.unbounded).toBe(true);
		expect(state.end.unbounded).toBe(true);
	});

	it('decomposes a boundary:end reference into useAnchorEnd, not literal text', () => {
		const state = decomposeTimeframeValue('([[Coronation]]:end, ∞)');
		expect(state.start).toEqual({ offset: '0', anchor: '[[Coronation]]', useAnchorEnd: true, unbounded: false });
	});

	it('decomposes a boundary:start reference the same as a plain anchor (numerically identical)', () => {
		const state = decomposeTimeframeValue('([[Coronation]]:start, ∞)');
		expect(state.start).toEqual({ offset: '0', anchor: '[[Coronation]]', useAnchorEnd: false, unbounded: false });
	});

	it('discards a stored unit (no control left to show it in)', () => {
		const state = decomposeTimeframeValue('((5, months, [[Founding]]), (10, months, ))');
		expect(state.start).toEqual({ offset: '5', anchor: '[[Founding]]', useAnchorEnd: false, unbounded: false });
	});

	it('decomposes a bare milestone shorthand into offset 0 with the anchor set', () => {
		const state = decomposeTimeframeValue('([[Founding]], ∞)');
		expect(state.start).toEqual({ offset: '0', anchor: '[[Founding]]', useAnchorEnd: false, unbounded: false });
	});

	it('detects the inherit (same-as-another-entity) form into its own mode', () => {
		const state = decomposeTimeframeValue('[[The War]]');
		expect(state.mode).toBe('inherit');
		expect(state.inheritLink).toBe('[[The War]]');
	});

	it('preserves a malformed stored value as literal Start offset text, in interval mode', () => {
		const state = decomposeTimeframeValue('garbage');
		expect(state.mode).toBe('interval');
		expect(state.point).toBe(true);
		expect(state.start.offset).toBe('garbage');
	});

	it('round-trips a bounded range', () => {
		const state = decomposeTimeframeValue('(1200, 1250)');
		expect(composeTimeframeValue(state, YEARS)).toBe('((1200, years, ), (1250, years, ))');
	});

	it('round-trips an unbounded end', () => {
		const state = decomposeTimeframeValue('(1200, ∞)');
		expect(composeTimeframeValue(state, YEARS)).toBe('((1200, years, ), ∞)');
	});

	it('round-trips a boundary:end reference', () => {
		const state = decomposeTimeframeValue('([[Coronation]]:end, ∞)');
		expect(composeTimeframeValue(state, YEARS)).toBe('([[Coronation]]:end, ∞)');
	});

	it('round-trips the inherit form', () => {
		const state = decomposeTimeframeValue('[[The War]]');
		expect(composeTimeframeValue(state, YEARS)).toBe('[[The War]]');
	});

	it('re-applies the CURRENT world unit on recompose, even if a different unit was originally stored (intentional normalization)', () => {
		const state = decomposeTimeframeValue('((5, months, [[Founding]]), (10, months, ))');
		expect(composeTimeframeValue(state, 'years')).toBe('((5, years, [[Founding]]), (10, years, ))');
	});

	it('normalizes a bare milestone shorthand to its canonical triplet form on recompose (meaning-preserving)', () => {
		const state = decomposeTimeframeValue('([[Founding]], ∞)');
		expect(composeTimeframeValue(state, 'years')).toBe('((0, years, [[Founding]]), ∞)');
	});
});
