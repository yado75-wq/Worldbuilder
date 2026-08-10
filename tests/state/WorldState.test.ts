import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import { scanVault } from '../../src/state/WorldState';
import { DEFAULT_SETTINGS } from '../../src/types';

function worldIndex(name: string, status: 'active' | 'inactive' = 'inactive'): string {
	return (
		`---\n` +
		`tags:\n` +
		`  - world\n` +
		`status: ${status}\n` +
		`template_set: defaults\n` +
		`name: "${name}"\n` +
		`---\n\n` +
		`# ${name}\n`
	);
}

describe('scanVault worlds', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('includes a normal world folder with a tagged _index.md', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile('MyWorld/_index.md', worldIndex('MyWorld', 'active'));

		const state = await scanVault(app, DEFAULT_SETTINGS);

		expect(state.worlds.map(w => w.path)).toContain('MyWorld');
		expect(state.activeWorld?.path).toBe('MyWorld');
	});

	it('ignores a world whose folder name starts with underscore', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile('MyWorld/_index.md', worldIndex('MyWorld', 'active'));
		vault.seedFile('_Archived/_index.md', worldIndex('Archived', 'active'));

		const state = await scanVault(app, DEFAULT_SETTINGS);

		expect(state.worlds.map(w => w.path)).toEqual(['MyWorld']);
		expect(state.worlds.some(w => w.path === '_Archived')).toBe(false);
		// Archived active status must not affect managed state
		expect(state.activeWorld?.path).toBe('MyWorld');
	});

	it('ignores underscore world even when it is the only candidate', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile('_Only/_index.md', worldIndex('Only', 'active'));

		const state = await scanVault(app, DEFAULT_SETTINGS);

		expect(state.worlds).toHaveLength(0);
		expect(state.activeWorld).toBeNull();
	});

	it('does not treat _index.md filename as archival', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile('Live/_index.md', worldIndex('Live', 'inactive'));

		const state = await scanVault(app, DEFAULT_SETTINGS);

		expect(state.worlds.map(w => w.path)).toEqual(['Live']);
	});
});