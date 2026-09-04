import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import { scanVault } from '../../src/state/WorldState';
import { DEFAULT_SETTINGS } from '../../src/types/runtime';

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

	it('keeps template_set name but empty rules when set is missing', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(
			'MyWorld/_index.md',
			`---\ntags:\n  - world\nstatus: active\ntemplate_set: gone\nname: "MyWorld"\n---\n\n# MyWorld\n`
		);
		// no template sets in vault

		const state = await scanVault(app, DEFAULT_SETTINGS);
		const world = state.worlds.find(w => w.path === 'MyWorld');

		expect(world).toBeDefined();
		expect(world!.templateSet).toBe('gone');		
		expect(world!.worldTemplate).toEqual([]);
	});

	it('does not bind another set when template_set name does not match', async () => {
		const vault = app.vault as unknown as FakeVault;
		// minimal defaults set so registry non-empty
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/folder-rules.md',
			'Character | Characters\n'
		);
		vault.seedFile(
			'MyWorld/_index.md',
			`---\ntags:\n  - world\nstatus: inactive\ntemplate_set: missing-set\nname: "MyWorld"\n---\n\n# MyWorld\n`
		);

		const state = await scanVault(app, DEFAULT_SETTINGS);
		const world = state.worlds.find(w => w.path === 'MyWorld');

		expect(world!.templateSet).toBe('missing-set');		
	});

	it('missing folder-rules.md is info, set remains valid', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile('_system/templates/defaults/world-template.md', 'Characters\n');
		vault.seedFile('_system/templates/defaults/WorldMeta_Fields.md',
			'name | Name | mandatory | text | title\n');
		vault.seedFile('_system/templates/defaults/Generic_Fields.md',
			'name | Name | mandatory | text | title\n');
		// no folder-rules.md

		const state = await scanVault(app, DEFAULT_SETTINGS);
		const set = state.templateSets.find(s => s.name === 'defaults');
		expect(set).toBeDefined();
		expect(set!.isValid).toBe(true);
		expect(set!.issues.some(i => i.kind === 'empty-folder-rules' && i.severity === 'info')).toBe(true);
		expect(set!.issues.some(i => i.file === 'folder-rules.md' && i.severity === 'error')).toBe(false);
	});

	it('missing world-template.md is info, set remains valid', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/Character_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFile(
			'_system/templates/defaults/folder-rules.md',
			'Character | Characters\n'
		);
		vault.seedFile(
			'_system/templates/defaults/WorldMeta_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFile(
			'_system/templates/defaults/Generic_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		// no world-template.md

		const state = await scanVault(app, DEFAULT_SETTINGS);
		const set = state.templateSets.find(s => s.name === 'defaults');
		expect(set).toBeDefined();
		expect(set!.isValid).toBe(true);
		expect(
			set!.issues.some(
				i => i.kind === 'empty-world-template' && i.severity === 'info'
			)
		).toBe(true);
		expect(
			set!.issues.some(
				i => i.file === 'world-template.md' && i.severity === 'error'
			)
		).toBe(false);
	});

	it('ignores a template set folder whose name starts with underscore', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/WorldMeta_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFile(
			'_system/templates/defaults/Generic_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFolder('_system/templates/_archived');
		vault.seedFile(
			'_system/templates/_archived/WorldMeta_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFile(
			'_system/templates/_archived/Generic_Fields.md',
			'name | Name | mandatory | text | title\n'
		);

		const state = await scanVault(app, DEFAULT_SETTINGS);

		expect(state.templateSets.map(s => s.name)).toEqual(['defaults']);
		expect(state.templateSets.some(s => s.name === '_archived')).toBe(false);
	});
});