import { describe, expect, it } from 'vitest';
import { allocateUniqueFolderName } from '../../src/util/uniqueFolderName';

describe('allocateUniqueFolderName', () => {
	const label = 'imported';

	it('returns base when free', () => {
		expect(allocateUniqueFolderName(() => false, 'michal', '', label)).toBe('michal');
	});

	it('uses (imported) when base taken', () => {
		const taken = new Set(['michal']);
		expect(
			allocateUniqueFolderName(p => taken.has(p), 'michal', '', label)
		).toBe('michal (imported)');
	});

	it('uses (imported N) when earlier import names taken', () => {
		const taken = new Set(['michal', 'michal (imported)', 'michal (imported 2)']);
		expect(
			allocateUniqueFolderName(p => taken.has(p), 'michal', '', label)
		).toBe('michal (imported 3)');
	});

	it('respects parentPath when checking existence', () => {
		const taken = new Set(['Campaigns/michal']);
		expect(
			allocateUniqueFolderName(p => taken.has(p), 'michal', 'Campaigns', label)
		).toBe('michal (imported)');
	});
});