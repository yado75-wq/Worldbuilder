import { describe, expect, it } from 'vitest';
import { hasActiveWorldConflict } from '../../src/context/ActiveWorld';
import { PluginState, WorldInfo } from '../../src/types';

function world(path: string, status: 'active' | 'inactive'): WorldInfo {
	return {
		name: path,
		path,
		folder: {} as WorldInfo['folder'],
		indexFile: {} as WorldInfo['indexFile'],
		status,
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};
}

function state(worlds: WorldInfo[]): PluginState {
	return {
		activeWorld: worlds.find(w => w.status === 'active') ?? null,
		worlds,
		templateSets: [],
	};
}

describe('hasActiveWorldConflict', () => {
	it('is false when there are no worlds', () => {
		expect(hasActiveWorldConflict(state([]))).toBe(false);
	});

	it('is false when exactly one world is active', () => {
		expect(
			hasActiveWorldConflict(state([world('A', 'active'), world('B', 'inactive')]))
		).toBe(false);
	});

	it('is true when two worlds are active', () => {
		expect(
			hasActiveWorldConflict(state([world('A', 'active'), world('B', 'active')]))
		).toBe(true);
	});

	it('is true when zero worlds are active but worlds exist', () => {
		expect(
			hasActiveWorldConflict(state([world('A', 'inactive'), world('B', 'inactive')]))
		).toBe(true);
	});
});
