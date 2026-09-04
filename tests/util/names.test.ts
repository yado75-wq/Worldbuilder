import { describe, expect, it } from 'vitest';
import { hasLeadingUnderscore } from '../../src/util/names';

describe('hasLeadingUnderscore', () => {
	it('detects leading underscore', () => {
		expect(hasLeadingUnderscore('_Archived')).toBe(true);
		expect(hasLeadingUnderscore('_')).toBe(true);
	});

	it('allows underscore elsewhere', () => {
		expect(hasLeadingUnderscore('my_world')).toBe(false);
		expect(hasLeadingUnderscore('A_')).toBe(false);
	});

	it('treats leading whitespace then underscore as forbidden', () => {
		expect(hasLeadingUnderscore('  _x')).toBe(true);
	});

	it('allows normal names', () => {
		expect(hasLeadingUnderscore('Aria')).toBe(false);
		expect(hasLeadingUnderscore('')).toBe(false);
	});
});