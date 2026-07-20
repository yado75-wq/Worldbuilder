import { describe, expect, it } from 'vitest';
import {
	findUnresolvedTimeframes,
	formatUnresolvedTimeframeEntry,
	TimeframeCheckTarget,
} from '../../../src/commands/shared/TimeframeResolutionReport';
import { TimeframeLookup } from '../../../src/time/TimeframeResolver';

function target(ref: string, fieldLabel = 'Timeframe'): TimeframeCheckTarget {
	return { ref, path: `Entities/${ref}.md`, basename: ref, fieldLabel };
}

describe('findUnresolvedTimeframes', () => {
	it('returns nothing for targets that resolve cleanly', () => {
		const lookup: TimeframeLookup = ref => (ref === 'Coronation' ? '(100, 100)' : undefined);
		const result = findUnresolvedTimeframes([target('Coronation')], lookup);
		expect(result).toEqual([]);
	});

	it('flags an entity whose value anchors to a milestone with no timepoint of its own', () => {
		// A ("The War") anchors to Milestone B ("Founding"), which has no
		// timeframe defined at all — B is the root cause (§6).
		const lookup: TimeframeLookup = ref => {
			if (ref === 'The War') return '((0, years, [[Founding]]), ∞)';
			return undefined; // Founding: no timeframe key present
		};

		const result = findUnresolvedTimeframes([target('The War')], lookup);

		expect(result).toHaveLength(1);
		expect(result[0]?.error.kind).toBe('unresolved-entity');
		expect(result[0]?.error.entity).toBe('Founding');
	});

	it('sorts the root-cause entity before its dependent when both are checked targets', () => {
		// Founding (Milestone) itself has a mandatory timeframe field that's
		// present but malformed. The War anchors to Founding, so it fails too,
		// downstream of Founding's own failure.
		const lookup: TimeframeLookup = ref => {
			if (ref === 'Founding') return 'not a real value';
			if (ref === 'The War') return '((0, years, [[Founding]]), ∞)';
			return undefined;
		};

		const result = findUnresolvedTimeframes([target('The War'), target('Founding')], lookup);

		expect(result).toHaveLength(2);
		expect(result[0]?.target.ref).toBe('Founding');
		expect(result[1]?.target.ref).toBe('The War');
		expect(result[0]?.error.kind).toBe('malformed-value');
		expect(result[1]?.error.entity).toBe('Founding');
	});

	it('puts the deepest root cause first even through a multi-level chain', () => {
		// C -> B -> A, where A has no timepoint. resolveComparableDate
		// propagates the *ultimate* root cause directly (§0/§6), so both B's
		// and C's failures point straight at A — B and C end up as
		// independent siblings under A, not a strict linear chain. Only "A
		// before both" is guaranteed; B vs. C order isn't.
		const lookup: TimeframeLookup = ref => {
			if (ref === 'B') return '((0, years, [[A]]), ∞)';
			if (ref === 'C') return '((0, years, [[B]]), ∞)';
			return undefined; // A: absent
		};

		const result = findUnresolvedTimeframes([target('C'), target('B'), target('A')], lookup);
		const order = result.map(e => e.target.ref);

		expect(order[0]).toBe('A');
		expect(order).toContain('B');
		expect(order).toContain('C');
		expect(result.every(e => e.error.entity === 'A')).toBe(true);
	});

	it('does not infinitely recurse on a genuine cycle, and still reports it', () => {
		const lookup: TimeframeLookup = ref => {
			if (ref === 'A') return '((0, years, [[B]]), ∞)';
			if (ref === 'B') return '((0, years, [[A]]), ∞)';
			return undefined;
		};

		const result = findUnresolvedTimeframes([target('A'), target('B')], lookup);

		expect(result).toHaveLength(2);
		expect(result.every(e => e.error.kind === 'cycle')).toBe(true);
	});

	it('flags a boundary reference into a point-only entity', () => {
		const lookup: TimeframeLookup = ref => {
			if (ref === 'Coronation') return '(100, 100)'; // a point: start === end
			if (ref === 'Feast') return '([[Coronation]]:end, ∞)';
			return undefined;
		};

		const result = findUnresolvedTimeframes([target('Feast')], lookup);

		expect(result).toHaveLength(1);
		expect(result[0]?.error.kind).toBe('boundary-on-point');
	});
});

describe('formatUnresolvedTimeframeEntry', () => {
	it('uses "Unresolved reference" wording per TIME_DESIGN.md §6, not "unresolvable"', () => {
		const lookup: TimeframeLookup = () => undefined;
		const [entry] = findUnresolvedTimeframes([target('Founding')], lookup);
		const line = formatUnresolvedTimeframeEntry(entry!);

		expect(line).toContain('Unresolved reference');
		expect(line).not.toContain('unresolvable');
		expect(line).toContain('[[Entities/Founding.md|Founding]]');
	});
});
