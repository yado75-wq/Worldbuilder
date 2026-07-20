import { describe, expect, it } from 'vitest';
import {
	composeTimeframeValue,
	decomposeTimeframeValue,
	emptyTimeframeFieldInput,
	TimeframeFieldInput,
} from '../../src/time/TimeframeWidgetState';

function input(overrides: Partial<TimeframeFieldInput>): TimeframeFieldInput {
	return { ...emptyTimeframeFieldInput(), ...overrides };
}

describe('composeTimeframeValue', () => {
	it('returns null when Start is entirely blank', () => {
		expect(composeTimeframeValue(input({ startRaw: '   ' }))).toBeNull();
	});

	it('mirrors Start into End when "point in time" is checked', () => {
		const value = composeTimeframeValue(input({ point: true, startRaw: '1200' }));
		expect(value).toBe('(1200, 1200)');
	});

	it('returns null in range mode when End is left blank', () => {
		const value = composeTimeframeValue(input({ point: false, startRaw: '1200', endRaw: '  ' }));
		expect(value).toBeNull();
	});

	it('produces a bounded range when both sides are filled', () => {
		const value = composeTimeframeValue(input({ point: false, startRaw: '1200', endRaw: '1250' }));
		expect(value).toBe('(1200, 1250)');
	});

	it('produces a half-open range from an explicit infinity token', () => {
		const value = composeTimeframeValue(input({ point: false, startRaw: '1200', endRaw: '∞' }));
		expect(value).toBe('(1200, ∞)');
	});

	it('canonicalizes a full anchor tuple through TimeframeSyntax', () => {
		const value = composeTimeframeValue(
			input({ point: false, startRaw: '(0,years,[[Founding]])', endRaw: '∞' })
		);
		expect(value).toBe('((0, years, [[Founding]]), ∞)');
	});

	it('preserves unparseable raw text rather than dropping or blocking it', () => {
		const value = composeTimeframeValue(input({ point: false, startRaw: 'not valid', endRaw: '1250' }));
		expect(value).toBe('(not valid, 1250)');
	});

	it('preserves an unparseable Start even in point mode', () => {
		const value = composeTimeframeValue(input({ point: true, startRaw: 'not valid' }));
		expect(value).toBe('(not valid, not valid)');
	});
});

describe('decomposeTimeframeValue', () => {
	it('returns an empty, point-mode default for an absent value', () => {
		expect(decomposeTimeframeValue(undefined)).toEqual(emptyTimeframeFieldInput());
		expect(decomposeTimeframeValue(null)).toEqual(emptyTimeframeFieldInput());
		expect(decomposeTimeframeValue('   ')).toEqual(emptyTimeframeFieldInput());
	});

	it('detects a point (equal sides) and checks the box', () => {
		const state = decomposeTimeframeValue('(1200, 1200)');
		expect(state.point).toBe(true);
		expect(state.startRaw).toBe('1200');
		expect(state.endRaw).toBe('');
	});

	it('detects a genuine range and unchecks the box', () => {
		const state = decomposeTimeframeValue('(1200, 1250)');
		expect(state.point).toBe(false);
		expect(state.startRaw).toBe('1200');
		expect(state.endRaw).toBe('1250');
	});

	it('round-trips a half-open range', () => {
		const state = decomposeTimeframeValue('(1200, ∞)');
		expect(state.point).toBe(false);
		expect(state.startRaw).toBe('1200');
		expect(state.endRaw).toBe('∞');
	});

	it('preserves an inherit link as literal Start text', () => {
		const state = decomposeTimeframeValue('[[The War]]');
		expect(state.point).toBe(true);
		expect(state.startRaw).toBe('[[The War]]');
	});

	it('preserves a malformed stored value as literal Start text', () => {
		const state = decomposeTimeframeValue('garbage');
		expect(state.point).toBe(true);
		expect(state.startRaw).toBe('garbage');
	});

	it('round-trips back through composeTimeframeValue for a well-formed range', () => {
		const original = '(1200, 1250)';
		const state = decomposeTimeframeValue(original);
		expect(composeTimeframeValue(state)).toBe(original);
	});
});
