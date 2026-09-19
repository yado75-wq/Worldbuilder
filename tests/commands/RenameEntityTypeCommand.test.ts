import { beforeEach, describe, expect, it } from 'vitest';
import { App, /*TFile*/ } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import {
	listRenamableEntityTypes,
	previewRenameEntityType,
	renameEntityType,
} from '../../src/commands/RenameEntityTypeCommand';
import { PluginState } from '../../src/types/runtime';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';

function characterFields() {
	return [
		{
			key: 'name',
			label: 'Name',
			type: 'text' as const,
			display: 'title' as const,
			mandatory: true,
		},
		{
			key: 'gear',
			label: 'Gear',
			type: 'link' as const,
			display: 'property' as const,
			mandatory: false,
			linkTypes: ['Weapon'],
			linkFolder: 'Weapon',
		},
	];
}

function buildState(overrides?: {
	fieldSets?: TemplateSetInfo['fieldSets'];
	worlds?: WorldInfo[];
}): PluginState {
	const fieldSets = overrides?.fieldSets ?? {
		Character: characterFields(),
		Weapon: [
			{
				key: 'name',
				label: 'Name',
				type: 'text' as const,
				display: 'title' as const,
				mandatory: true,
			},
		],
		WorldMeta: [
			{
				key: 'name',
				label: 'Name',
				type: 'text' as const,
				display: 'title' as const,
				mandatory: true,
			},
		],
	};

	const set: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
		worldTemplate: [],
		fieldSets,
	};

	return {
		templateSets: [set],
		worlds: overrides?.worlds ?? [],
		activeWorld: null,
	};
}

describe('listRenamableEntityTypes', () => {
	it('excludes WorldMeta', () => {
		const types = listRenamableEntityTypes({
			Character: [],
			WorldMeta: [],
			Generic: [],
		});
		expect(types.sort()).toEqual(['Character', 'Generic']);
	});
});

describe('renameEntityType', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);		
	});

	it('returns reserved-type for WorldMeta', async () => {
		const state = buildState();
		const result = await renameEntityType(
			app,
			state,
			'defaults',
			'WorldMeta',
			'Meta',
			() => Promise.resolve(true)
		);
		expect(result).toEqual({ ok: false, code: 'reserved-type' });
	});

	it('returns leading-underscore for new name', async () => {
		const state = buildState();
		const result = await renameEntityType(
			app,
			state,
			'defaults',
			'Character',
			'_Postava',
			() => Promise.resolve(true)
		);
		expect(result).toEqual({ ok: false, code: 'leading-underscore' });
	});

	it('returns cancelled when confirm is false', async () => {
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

		const state = buildState();
		const result = await renameEntityType(
			app,
			state,
			'defaults',
			'Character',
			'Postava',
			() => Promise.resolve(false)
		);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
	});

	it('renames fields file, rules, and retags notes on happy path', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/Character_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		vault.seedFile(
			'_system/templates/defaults/Weapon_Fields.md',
			'name | Name | mandatory | text | title\n' +
				'owner | Owner | optional | link:Character | property\n'
		);
		vault.seedFile(
			'_system/templates/defaults/folder-rules.md',
			'Character | Characters\n'
		);
		vault.seedFolder('MyWorld/Characters');
		vault.seedFile(
			'MyWorld/Characters/Aria.md',
			'---\ntags:\n  - character\nname: "Aria"\n---\n\n# Aria\n'
		);

		const world = {
			name: 'MyWorld',
			path: 'MyWorld',
			templateSet: 'defaults',
			status: 'active',
		} as WorldInfo;

		const state = buildState({ worlds: [world] });
		const result = await renameEntityType(
			app,
			state,
			'defaults',
			'Character',
			'Postava',
			() => Promise.resolve(true)
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.oldType).toBe('Character');
		expect(result.newType).toBe('Postava');
		expect(vault.contentAt('_system/templates/defaults/Postava_Fields.md')).toContain(
			'name | Name'
		);
		const oldContent = vault.contentAt('_system/templates/defaults/Character_Fields.md');
		expect(!oldContent || oldContent === '').toBe(true);
		expect(vault.contentAt('_system/templates/defaults/folder-rules.md')).toContain(
			'Postava | Characters'
		);
		expect(vault.contentAt('_system/templates/defaults/Weapon_Fields.md')).toContain(
			'link:Postava'
		);
		expect(vault.contentAt('MyWorld/Characters/Aria.md')).toContain('- postava');
		expect(vault.contentAt('MyWorld/Characters/Aria.md')).not.toMatch(
			/^\s*-\s*character\s*$/m
		);
	});

	it('returns new-exists when target type already present', async () => {
		const state = buildState();
		const result = await renameEntityType(
			app,
			state,
			'defaults',
			'Character',
			'Weapon',
			() => Promise.resolve(true)
		);
		expect(result).toEqual({ ok: false, code: 'new-exists' });
	});
});

describe('previewRenameEntityType', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);		
	});

	it('returns impact counts without writing', async () => {
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

		const state = buildState();
		const preview = await previewRenameEntityType(
			app,
			state,
			'defaults',
			'Character',
			'Postava'
		);
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.impact.rulesLines).toBe(1);
		expect(vault.contentAt('_system/templates/defaults/Character_Fields.md')).toBeTruthy();
	});
});
