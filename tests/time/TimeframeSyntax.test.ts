import { describe, expect, it } from 'vitest';
import {
	parseTimepoint,
	parseTimeframeValue,
	serializeTimepoint,
	serializeTimeframeValue,
	Timepoint,
	TimeframeValue,
} from '../../src/time/TimeframeSyntax';

describe('parseTimepoint', () => {
	it('parses a bare number', () => {
		const r = parseTimepoint('1200');
		expect(r).toEqual({ ok: true, value: { kind: 'number', offset: 1200 } });
	});

	it('parses a negative and decimal bare number', () => {
		expect(parseTimepoint('-50')).toEqual({ ok: true, value: { kind: 'number', offset: -50 } });
		expect(parseTimepoint('12.5')).toEqual({ ok: true, value: { kind: 'number', offset: 12.5 } });
	});

	it('rejects a loosely-parseable number like "500 BC"', () => {
		const r = parseTimepoint('500 BC');
		expect(r.ok).toBe(false);
	});

	it('parses a bare milestone link', () => {
		const r = parseTimepoint('[[Founding of the Empire]]');
		expect(r).toEqual({ ok: true, value: { kind: 'milestone', link: 'Founding of the Empire' } });
	});

	it('parses infinity tokens, signed', () => {
		expect(parseTimepoint('∞')).toEqual({ ok: true, value: { kind: 'infinity', sign: 1 } });
		expect(parseTimepoint('+∞')).toEqual({ ok: true, value: { kind: 'infinity', sign: 1 } });
		expect(parseTimepoint('-∞')).toEqual({ ok: true, value: { kind: 'infinity', sign: -1 } });
	});

	it('parses a boundary reference', () => {
		expect(parseTimepoint('[[Thirty Years War]]:end')).toEqual({
			ok: true,
			value: { kind: 'boundary', link: 'Thirty Years War', boundary: 'end' },
		});
		expect(parseTimepoint('[[Thirty Years War]]:start')).toEqual({
			ok: true,
			value: { kind: 'boundary', link: 'Thirty Years War', boundary: 'start' },
		});
	});

	it('parses a full triplet with all three slots filled', () => {
		const r = parseTimepoint('(50, years, [[Founding]])');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: 'years', anchor: 'Founding' },
		});
	});

	it('parses a triplet with the unit slot omitted', () => {
		const r = parseTimepoint('(50, , [[Founding]])');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: null, anchor: 'Founding' },
		});
	});

	it('parses a triplet with the anchor slot omitted', () => {
		const r = parseTimepoint('(50, years, )');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: 'years', anchor: null },
		});
	});

	it('parses a triplet with both unit and anchor omitted', () => {
		const r = parseTimepoint('(50, , )');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: null, anchor: null },
		});
	});

	it('tolerates extra whitespace around parts', () => {
		const r = parseTimepoint('(  50 ,  years  ,  [[Founding]]  )');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: 'years', anchor: 'Founding' },
		});
	});

	it('rejects a triplet missing its mandatory offset', () => {
		const r = parseTimepoint('(, years, [[Founding]])');
		expect(r.ok).toBe(false);
	});

	it('rejects a triplet with a malformed anchor', () => {
		const r = parseTimepoint('(50, years, not a link)');
		expect(r.ok).toBe(false);
	});

	it('rejects a parenthesized group with the wrong comma count for a timepoint (1 comma)', () => {
		const r = parseTimepoint('(50, [[Founding]])');
		expect(r.ok).toBe(false);
	});

	it('correctly handles a wikilink title containing its own parens and comma', () => {
		// The nested "(" / ")" inside the title, and the comma inside it,
		// must not be mistaken for top-level structure.
		const r = parseTimepoint('(50, years, [[Founding (Year One, allegedly)]])');
		expect(r).toEqual({
			ok: true,
			value: { kind: 'triplet', offset: 50, unit: 'years', anchor: 'Founding (Year One, allegedly)' },
		});
	});

	it('rejects unrecognized garbage', () => {
		expect(parseTimepoint('banana').ok).toBe(false);
		expect(parseTimepoint('').ok).toBe(false);
	});
});

describe('parseTimeframeValue', () => {
	it('parses an interval of a bare number and a milestone link', () => {
		const r = parseTimeframeValue('(50, [[Founding]])');
		expect(r).toEqual({
			ok: true,
			value: {
				kind: 'interval',
				start: { kind: 'number', offset: 50 },
				end: { kind: 'milestone', link: 'Founding' },
			},
		});
	});

	it('parses a half-open interval with an infinity token', () => {
		const r = parseTimeframeValue('(1200, ∞)');
		expect(r).toEqual({
			ok: true,
			value: {
				kind: 'interval',
				start: { kind: 'number', offset: 1200 },
				end: { kind: 'infinity', sign: 1 },
			},
		});
	});

	it('parses an equal-values point interval', () => {
		const r = parseTimeframeValue('(1200, 1200)');
		expect(r.ok).toBe(true);
	});

	it('parses a bare top-level link as inherit-whole-interval', () => {
		const r = parseTimeframeValue('[[Thirty Years War]]');
		expect(r).toEqual({ ok: true, value: { kind: 'inherit', link: 'Thirty Years War' } });
	});

	it('parses nested triplets on both sides of an interval', () => {
		const r = parseTimeframeValue('((50, years, [[Founding]]), (100, years, [[Founding]]))');
		expect(r.ok).toBe(true);
		if (r.ok && r.value.kind === 'interval') {
			expect(r.value.start).toEqual({ kind: 'triplet', offset: 50, unit: 'years', anchor: 'Founding' });
			expect(r.value.end).toEqual({ kind: 'triplet', offset: 100, unit: 'years', anchor: 'Founding' });
		}
	});

	it('rejects a bare top-level triplet (2 commas) — no point shorthand at top level', () => {
		const r = parseTimeframeValue('(50, years, [[Founding]])');
		expect(r.ok).toBe(false);
	});

	it('rejects a top-level value with 0 commas that is not a bare link', () => {
		const r = parseTimeframeValue('(1200)');
		expect(r.ok).toBe(false);
	});

	it('rejects unbalanced brackets', () => {
		const r = parseTimeframeValue('(1200, [[Founding)');
		expect(r.ok).toBe(false);
	});

	it('propagates a malformed timepoint error from within an interval', () => {
		const r = parseTimeframeValue('(1200, 500 BC)');
		expect(r.ok).toBe(false);
	});
});

describe('round-tripping', () => {
	const cases: TimeframeValue[] = [
		{ kind: 'interval', start: { kind: 'number', offset: 1200 }, end: { kind: 'number', offset: 1250 } },
		{ kind: 'interval', start: { kind: 'number', offset: 1200 }, end: { kind: 'infinity', sign: 1 } },
		{ kind: 'interval', start: { kind: 'infinity', sign: -1 }, end: { kind: 'number', offset: 1250 } },
		{ kind: 'interval', start: { kind: 'milestone', link: 'Founding' }, end: { kind: 'milestone', link: 'Founding' } },
		{
			kind: 'interval',
			start: { kind: 'triplet', offset: 50, unit: 'years', anchor: 'Founding' },
			end: { kind: 'triplet', offset: 50, unit: null, anchor: null },
		},
		{ kind: 'interval', start: { kind: 'boundary', link: 'War', boundary: 'start' }, end: { kind: 'boundary', link: 'War', boundary: 'end' } },
		{ kind: 'inherit', link: 'Thirty Years War' },
	];

	it.each(cases)('serialize -> parse reproduces the same structured value', (value) => {
		const serialized = serializeTimeframeValue(value);
		const reparsed = parseTimeframeValue(serialized);
		expect(reparsed).toEqual({ ok: true, value });
	});
});

describe('serializeTimepoint', () => {
	it('renders an omitted slot as empty, not as a placeholder word', () => {
		const tp: Timepoint = { kind: 'triplet', offset: 50, unit: null, anchor: 'Founding' };
		expect(serializeTimepoint(tp)).toBe('(50, , [[Founding]])');
	});
});
