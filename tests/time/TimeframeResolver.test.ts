import { describe, expect, it } from 'vitest';
import { parseTimepoint } from '../../src/time/TimeframeSyntax';
import {
	resolveComparableDate,
	resolveEntityTimeframe,
	TimeframeLookup,
} from '../../src/time/TimeframeResolver';

/** Builds a lookup from a plain record of entity name -> raw frontmatter string. */
function lookupFrom(entries: Record<string, string>): TimeframeLookup {
	return (entityRef: string) => entries[entityRef];
}

/** Convenience: parse a timepoint literal, asserting the parse itself succeeds. */
function tp(raw: string) {
	const r = parseTimepoint(raw);
	if (!r.ok) throw new Error(`test setup: failed to parse timepoint "${raw}": ${r.error}`);
	return r.value;
}

describe('resolveComparableDate — no anchor needed', () => {
	it('resolves a bare number relative to the implicit zero, with no lookups', () => {
		const lookup = lookupFrom({});
		const r = resolveComparableDate(tp('1200'), lookup);
		expect(r).toEqual({ ok: true, value: 1200 });
	});

	it('resolves signed infinity directly', () => {
		const lookup = lookupFrom({});
		expect(resolveComparableDate(tp('∞'), lookup)).toEqual({ ok: true, value: Infinity });
		expect(resolveComparableDate(tp('-∞'), lookup)).toEqual({ ok: true, value: -Infinity });
	});

	it('resolves a triplet with an omitted anchor relative to the implicit zero', () => {
		const lookup = lookupFrom({});
		const r = resolveComparableDate(tp('(50, years, )'), lookup);
		expect(r).toEqual({ ok: true, value: 50 });
	});
});

describe('resolveComparableDate — milestone and anchored chains', () => {
	it('resolves a bare milestone link as offset 0 from that milestone', () => {
		const lookup = lookupFrom({ Founding: '(0, 0)' });
		const r = resolveComparableDate(tp('[[Founding]]'), lookup);
		expect(r).toEqual({ ok: true, value: 0 });
	});

	it('resolves a triplet anchored to a milestone (single hop)', () => {
		const lookup = lookupFrom({ Founding: '(1000, 1000)' });
		const r = resolveComparableDate(tp('(50, years, [[Founding]])'), lookup);
		expect(r).toEqual({ ok: true, value: 1050 });
	});

	it('resolves a multi-hop chain: A -> anchored to B -> anchored to C -> implicit zero', () => {
		const lookup = lookupFrom({
			C: '(1000, 1000)',
			B: '((10, years, [[C]]), (10, years, [[C]]))',
		});
		// A itself: (5, years, [[B]]) => B resolves to 1010, so A = 1015
		const r = resolveComparableDate(tp('(5, years, [[B]])'), lookup);
		expect(r).toEqual({ ok: true, value: 1015 });
	});

	it('resolves an entity whose stored value is itself a bare inherit link, chained', () => {
		const lookup = lookupFrom({
			War: '(1200, 1250)',
			Alias: '[[War]]',
		});
		const r = resolveEntityTimeframe('Alias', lookup);
		expect(r).toEqual({ ok: true, value: { start: 1200, end: 1250 } });
	});
});

describe('resolveComparableDate — boundary references', () => {
	it('resolves the start and end of an interval-valued entity', () => {
		const lookup = lookupFrom({ 'Thirty Years War': '(1618, 1648)' });
		expect(resolveComparableDate(tp('[[Thirty Years War]]:start'), lookup)).toEqual({ ok: true, value: 1618 });
		expect(resolveComparableDate(tp('[[Thirty Years War]]:end'), lookup)).toEqual({ ok: true, value: 1648 });
	});

	it('resolves a half-open boundary to Infinity', () => {
		const lookup = lookupFrom({ 'Current Epoch': '(1900, ∞)' });
		const r = resolveComparableDate(tp('[[Current Epoch]]:end'), lookup);
		expect(r).toEqual({ ok: true, value: Infinity });
	});

	it('fails with boundary-on-point when the target is a degenerate (point) interval', () => {
		const lookup = lookupFrom({ Coronation: '(1200, 1200)' });
		const r = resolveComparableDate(tp('[[Coronation]]:start'), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('boundary-on-point');
			expect(r.error.entity).toBe('Coronation');
		}
	});
});

describe('resolveComparableDate — cycle detection', () => {
	it('detects a direct self-reference', () => {
		const lookup = lookupFrom({ A: '([[A]], [[A]])' });
		const r = resolveEntityTimeframe('A', lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('cycle');
	});

	it('detects a two-entity mutual cycle (A -> B -> A)', () => {
		const lookup = lookupFrom({
			A: '((0, years, [[B]]), (0, years, [[B]]))',
			B: '((0, years, [[A]]), (0, years, [[A]]))',
		});
		const r = resolveEntityTimeframe('A', lookup);
		expect(r.ok).toBe(false);
		if (!r.ok && r.error.kind === 'cycle') {
			expect(r.error.chain).toEqual(['A', 'B', 'A']);
		} else {
			throw new Error('expected a cycle error');
		}
	});

	it('detects a cycle reached through an inherit chain', () => {
		const lookup = lookupFrom({ A: '[[B]]', B: '[[A]]' });
		const r = resolveEntityTimeframe('A', lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.kind).toBe('cycle');
	});

	it('does not falsely flag a diamond (A -> B -> D, A -> C -> D) as a cycle', () => {
		const lookup = lookupFrom({
			D: '(1000, 1000)',
			B: '((0, years, [[D]]), (0, years, [[D]]))',
			C: '((5, years, [[D]]), (5, years, [[D]]))',
			A: '((0, years, [[B]]), (0, years, [[C]]))',
		});
		const r = resolveEntityTimeframe('A', lookup);
		expect(r).toEqual({ ok: true, value: { start: 1000, end: 1005 } });
	});
});

describe('resolveComparableDate — root-cause identification (§6)', () => {
	it('surfaces the entity with no timeframe at all, not the entity that referenced it', () => {
		// A anchors to B, B has no timeframe defined at all.
		const lookup = lookupFrom({}); // B is entirely absent from the lookup
		const r = resolveComparableDate(tp('(5, years, [[B]])'), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('unresolved-entity');
			expect(r.error.entity).toBe('B');
		}
	});

	it('surfaces the deep root cause through a multi-hop chain (A -> B -> C, C unset)', () => {
		const lookup = lookupFrom({
			// C intentionally absent.
			B: '((10, years, [[C]]), (10, years, [[C]]))',
		});
		const r = resolveComparableDate(tp('(5, years, [[B]])'), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('unresolved-entity');
			expect(r.error.entity).toBe('C');
			expect(r.error.entity).not.toBe('B');
		}
	});

	it('surfaces a malformed value at the entity where the malformed string actually lives', () => {
		const lookup = lookupFrom({
			B: 'not a valid timeframe at all',
		});
		const r = resolveComparableDate(tp('(5, years, [[B]])'), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('malformed-value');
			expect(r.error.entity).toBe('B');
		}
	});

	it('surfaces the boundary-on-point root cause through a chain, not the referencing entity', () => {
		const lookup = lookupFrom({
			Coronation: '(1200, 1200)',
		});
		// A's end is defined as "the end of the Coronation" — but Coronation is a point.
		const r = resolveComparableDate(tp('[[Coronation]]:end'), lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('boundary-on-point');
			expect(r.error.entity).toBe('Coronation');
		}
	});

	it('reports the first unresolved side when both sides of an interval are broken (start before end)', () => {
		const lookup = lookupFrom({ Whatever: '([[MissingStart]], [[MissingEnd]])' });
		const r = resolveEntityTimeframe('Whatever', lookup);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.kind).toBe('unresolved-entity');
			expect(r.error.entity).toBe('MissingStart');
		}
	});
});

describe('resolveEntityTimeframe — whole-entity resolution', () => {
	it('resolves a plain bounded range', () => {
		const lookup = lookupFrom({ 'Thirty Years War': '(1618, 1648)' });
		const r = resolveEntityTimeframe('Thirty Years War', lookup);
		expect(r).toEqual({ ok: true, value: { start: 1618, end: 1648 } });
	});

	it('resolves a half-open range with a real start and an infinite end', () => {
		const lookup = lookupFrom({ Modernity: '(1900, ∞)' });
		const r = resolveEntityTimeframe('Modernity', lookup);
		expect(r).toEqual({ ok: true, value: { start: 1900, end: Infinity } });
	});

	it('propagates a not-found entity as unresolved rather than throwing', () => {
		const lookup = lookupFrom({});
		const r = resolveEntityTimeframe('Nonexistent', lookup);
		expect(r).toEqual({
			ok: false,
			error: {
				kind: 'unresolved-entity',
				entity: 'Nonexistent',
				message: '"Nonexistent" has no timeframe defined.',
			},
		});
	});
});
