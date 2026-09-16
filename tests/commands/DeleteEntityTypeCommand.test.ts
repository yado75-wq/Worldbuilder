import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import {
	deleteEntityType,
	listDeletableEntityTypes,
	previewDeleteEntityType,
} from '../../src/commands/DeleteEntityTypeCommand';
import { PluginState } from '../../src/types/runtime';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';

import {
	removeFolderRulesEntityLine,
	removeTypeFromFieldTypeSpec,
	removeTypeFromFieldsFileContent,
} from '../../src/util/entityTypeRewrite';

function installVaultDelete(app: App): void {
	const trash = (file: { path: string }): Promise<void> => {
		const vault = app.vault as unknown as FakeVault;
		const files = (vault as unknown as { files?: Map<string, string> }).files;
		if (files?.delete) files.delete(file.path);
		else vault.seedFile(file.path, '');
		return Promise.resolve();
	};
	(app.fileManager as unknown as { trashFile: (f: { path: string }) => Promise<void> }).trashFile = trash;
}

function titleField() {
	return {
		key: 'name',
		label: 'Name',
		type: 'text' as const,
		display: 'title' as const,
		mandatory: true,
	};
}

function buildState(overrides?: {
	setName?: string;
	fieldSets?: TemplateSetInfo['fieldSets'];
	worlds?: WorldInfo[];
}): PluginState {
	const fieldSets = overrides?.fieldSets ?? {
		Character: [titleField()],
		Weapon: [titleField()],
		WorldMeta: [titleField()],
	};
	const set: TemplateSetInfo = {
		name: overrides?.setName ?? 'defaults',
		path: `_system/templates/${overrides?.setName ?? 'defaults'}`,
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

describe('removeType pure helpers', () => {
	it('removes segment from link chain', () => {
		expect(removeTypeFromFieldTypeSpec('link:Weapon>Armor', 'Weapon')).toBe(
			'link:Armor'
		);
		expect(removeTypeFromFieldTypeSpec('link:Character', 'Character')).toBe('text');
	});

	it('removes folder-rules line', () => {
		const { content, removals } = removeFolderRulesEntityLine(
			'Character | Characters\nLocation | Locations\n',
			'Character'
		);
		expect(removals).toBe(1);
		expect(content).toContain('Location | Locations');
		expect(content).not.toContain('Character');
	});

	it('strips type from fields file type column', () => {
		const raw =
			'name | Name | mandatory | text | title\n' +
			'owner | Owner | optional | link:Character | property\n';
		const { content, replacements } = removeTypeFromFieldsFileContent(raw, 'Character');
		expect(replacements).toBe(1);
		expect(content).toContain('text');
		expect(content).not.toContain('link:Character');
	});
});

describe('listDeletableEntityTypes', () => {
	it('excludes WorldMeta', () => {
		expect(
			listDeletableEntityTypes({
				Character: [],
				WorldMeta: [],
				Generic: [],
			}).sort()
		).toEqual(['Character', 'Generic']);
	});
});

describe('deleteEntityType', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);
		installVaultDelete(app);
	});

	it('blocks WorldMeta', async () => {
		const result = await deleteEntityType(
			app,
			buildState(),
			'defaults',
			'WorldMeta',
			() => Promise.resolve(true)
		);
		expect(result).toEqual({ ok: false, code: 'reserved-type' });
	});

	it('returns cancelled when confirm is false', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/Character_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		const result = await deleteEntityType(
			app,
			buildState(),
			'defaults',
			'Character',
			() => Promise.resolve(false)
		);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
	});

	it('full cleanup when zero instances', async () => {
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
			'Character | Characters\nWeapon | Weapons\n'
		);

		const result = await deleteEntityType(
			app,
			buildState(),
			'defaults',
			'Character',
			() => Promise.resolve(true)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.removedFolderRule).toBe(true);
		expect(result.cleanedLinkTokens).toBe(true);
		expect(result.instancesRemaining).toBe(0);
		expect(vault.contentAt('_system/templates/defaults/Character_Fields.md')).toBeFalsy();
		expect(vault.contentAt('_system/templates/defaults/folder-rules.md')).not.toContain(
			'Character'
		);
		expect(vault.contentAt('_system/templates/defaults/Weapon_Fields.md')).not.toContain(
			'link:Character'
		);
	});

	it('keeps rules and tokens by default when instances exist', async () => {
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

		const result = await deleteEntityType(
			app,
			buildState({ worlds: [world] }),
			'defaults',
			'Character',
			() => Promise.resolve(true)
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.instancesRemaining).toBe(1);
		expect(result.removedFolderRule).toBe(false);
		expect(result.cleanedLinkTokens).toBe(false);
		expect(vault.contentAt('_system/templates/defaults/Character_Fields.md')).toBeFalsy();
		expect(vault.contentAt('_system/templates/defaults/folder-rules.md')).toContain(
			'Character'
		);
		expect(vault.contentAt('_system/templates/defaults/Weapon_Fields.md')).toContain(
			'link:Character'
		);
		expect(vault.contentAt('MyWorld/Characters/Aria.md')).toContain('- character');
	});
});

describe('previewDeleteEntityType', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);
		installVaultDelete(app);
	});

	it('flags generic defaults warning only on defaults set', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('_system/templates/defaults');
		vault.seedFile(
			'_system/templates/defaults/Generic_Fields.md',
			'name | Name | mandatory | text | title\n'
		);
		const preview = await previewDeleteEntityType(
			app,
			buildState({
				fieldSets: { Generic: [titleField()], WorldMeta: [titleField()] },
			}),
			'defaults',
			'Generic'
		);
		expect(preview.ok).toBe(true);
		if (!preview.ok) return;
		expect(preview.impact.genericDefaultsWarning).toBe(true);
	});
});
