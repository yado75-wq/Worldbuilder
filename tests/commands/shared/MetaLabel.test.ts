import { describe, expect, it } from 'vitest';
import { formatMetaLabel } from '../../../src/commands/shared/MetaLabel';

describe('formatMetaLabel', () => {
	it('capitalizes a single-word key', () => {
		expect(formatMetaLabel('genre')).toBe('Genre');
	});

	it('title-cases a snake_case key instead of only capitalizing the first letter', () => {
		expect(formatMetaLabel('time_unit')).toBe('Time Unit');
		expect(formatMetaLabel('time_zero')).toBe('Time Zero');
	});

	it('handles multi-word snake_case keys', () => {
		expect(formatMetaLabel('target_audience_group')).toBe('Target Audience Group');
	});
});
