import { describe, expect, it } from 'vitest';
import { resolveTimeframeFieldsForDisplay } from '../../../src/commands/shared/TimeframeDisplay';
import { FieldDefinition } from '../../../src/types';
import { TimeframeLookup } from '../../../src/time/TimeframeResolver';

const timeframeField: FieldDefinition = {
	key: 'time', label: 'Timeframe', mandatory: true, type: 'timeframe', display: 'property',
};
const otherField: FieldDefinition = {
	key: 'role', label: 'Role', mandatory: false, type: 'text', display: 'property',
};
const fields = [timeframeField, otherField];
const SELF = 'ww 2';

describe('resolveTimeframeFieldsForDisplay', () => {
	it('skips fields with no value', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(fields, { time: null }, lookup, 'years', SELF);
		expect(result.time).toBeUndefined();
	});

	it('resolves a point value with no anchors and puts the world time unit first', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(fields, { time: '(1945, 1945)' }, lookup, 'rok', SELF);
		expect(result.time).toEqual({ ok: true, display: 'rok 1945' });
	});

	it('resolves a genuine range and shows an en-dash span', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(fields, { time: '(1200, 1250)' }, lookup, 'years', SELF);
		expect(result.time).toEqual({ ok: true, display: 'years 1200 – 1250' });
	});

	it('resolves through an anchor via the injected lookup', () => {
		const lookup: TimeframeLookup = ref => (ref === 'Founding' ? '(1900, 1900)' : undefined);
		const result = resolveTimeframeFieldsForDisplay(
			fields,
			{ time: '((5, years, [[Founding]]), ∞)' },
			lookup,
			'years',
			SELF
		);
		expect(result.time).toEqual({ ok: true, display: 'years 1905 – ∞' });
	});

	it('reports a failure with a human-readable message (not a thrown error) when the anchor cannot be resolved', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(
			fields,
			{ time: '((0, years, [[Missing]]), ∞)' },
			lookup,
			'years',
			SELF
		);
		expect(result.time?.ok).toBe(false);
		expect(result.time?.message).toContain('Missing');
	});

	it('reports a failure for a malformed value rather than throwing', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(fields, { time: 'not valid' }, lookup, 'years', SELF);
		expect(result.time?.ok).toBe(false);
	});

	it('detects a direct self-reference as a cycle, with the chain in the message', () => {
		// The entity's own field points at itself by name.
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(
			fields,
			{ time: `((0, years, [[${SELF}]]), ∞)` },
			lookup,
			'years',
			SELF
		);
		expect(result.time?.ok).toBe(false);
		expect(result.time?.message).toContain(SELF);
	});

	it('detects an INDIRECT cycle routed back through this entity via another real entity — the bug this selfRef fix targets', () => {
		// ww2 -> Other -> ww2. Using ww2's real name (not a synthetic
		// placeholder) as selfRef is what makes TimeframeResolver.ts's own
		// cycle-detection stack actually contain the ref the loop comes back
		// around to.
		const lookup: TimeframeLookup = ref =>
			(ref === 'Other' ? `((0, years, [[${SELF}]]), ∞)` : undefined);
		const result = resolveTimeframeFieldsForDisplay(
			fields,
			{ time: '((0, years, [[Other]]), ∞)' },
			lookup,
			'years',
			SELF
		);
		expect(result.time?.ok).toBe(false);
		expect(result.time?.message).toMatch(/cycle/i);
	});

	it('resolves the field\u2019s own raw value directly, unaffected by an unrelated vault entity sharing the field key as a name', () => {
		const lookup: TimeframeLookup = ref => (ref === 'time' ? '(9999, 9999)' : undefined);
		const result = resolveTimeframeFieldsForDisplay(fields, { time: '(1945, 1945)' }, lookup, 'years', SELF);
		expect(result.time).toEqual({ ok: true, display: 'years 1945' });
	});

	it('ignores non-timeframe fields entirely', () => {
		const lookup: TimeframeLookup = () => undefined;
		const result = resolveTimeframeFieldsForDisplay(fields, { role: 'Hero' }, lookup, 'years', SELF);
		expect(result.role).toBeUndefined();
	});
});
