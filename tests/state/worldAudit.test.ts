import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import {
	auditWorld,
	compareInstanceToTemplate,
	findOrphanEntityNotes,
} from '../../src/state/worldAudit';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { FieldDefinition } from '../../src/formkit';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';

function titleField(): FieldDefinition {
	return {
		key: 'name',
		label: 'Name',
		type: 'text',
		display: 'title',
		mandatory: true,
	};
}

function opt(key: string): FieldDefinition {
	return {
		key,
		label: key,
		type: 'text',
		display: 'property',
		mandatory: false,
	};
}

function characterFieldsOnly(): FieldDefinition[] {
	return [titleField(), opt('race'), opt('profession'), opt('background')];
}

function baseSet(overrides: Partial<TemplateSetInfo> = {}): TemplateSetInfo {
	return {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
		worldTemplate: [],
		fieldSets: {
			Character: characterFieldsOnly(),
		},
		...overrides,
	};
}

describe('compareInstanceToTemplate', () => {
	it('flags extra keys and missing mandatory', () => {
		const { extraKeys, missingMandatory } = compareInstanceToTemplate(
			{
				tags: ['character'],
				race: 'elf',
				faction: 'Bonkers',
				gear: ['[[Axe]]'],
			},
			characterFieldsOnly()
		);
		expect(extraKeys.sort()).toEqual(['faction', 'gear']);
		expect(missingMandatory).toEqual(['name']);
	});

	it('ignores tags and accepts present name', () => {
		const { extraKeys, missingMandatory } = compareInstanceToTemplate(
			{ tags: ['character'], name: 'aria', race: 'x' },
			characterFieldsOnly()
		);
		expect(extraKeys).toEqual([]);
		expect(missingMandatory).toEqual([]);
	});
});

describe('findOrphanEntityNotes', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('finds notes tagged for a rule type with no field set', () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(
			'MyWorld/Characters/Aria.md',
			'---\ntags:\n  - character\nname: "Aria"\n---\n\n# Aria\n'
		);

		const set = baseSet({
			fieldSets: {
				Location: [titleField()],
			},
		});
		const orphans = findOrphanEntityNotes(app, 'MyWorld', set);
		expect(orphans).toHaveLength(1);
		expect(orphans[0]?.basename).toBe('Aria');
		expect(orphans[0]?.entityType).toBe('Character');
	});

	it('finds catalog notes tagged with no fields and no folder-rules row', () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(
			'MyWorld/Gear/Axe.md',
			'---\ntags:\n  - weapon\nname: "Axe"\n---\n\n# Axe\n'
		);

		const set = baseSet({
			folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
			fieldSets: {
				Character: characterFieldsOnly(),
			},
		});
		const orphans = findOrphanEntityNotes(app, 'MyWorld', set);
		expect(orphans).toHaveLength(1);
		expect(orphans[0]?.tag).toBe('weapon');
		expect(orphans[0]?.basename).toBe('Axe');
	});
});

describe('findSchemaDrift / auditWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);
	});

	it('flags Aria-style extra keys against Character fields', () => {
		const { extraKeys, missingMandatory } = compareInstanceToTemplate(
			{
				tags: ['character'],
				name: 'aria',
				race: 'unimportant',
				faction: 'Bonkers',
				profession: 'bonker',
				gear: ['[[Axe]]', '[[Chainmail]]'],
			},
			characterFieldsOnly()
		);
		expect(extraKeys.sort()).toEqual(['faction', 'gear']);
		expect(missingMandatory).toEqual([]);
	});

	it('auditWorld returns missing set error', () => {
		const world = {
			name: 'MyWorld',
			path: 'MyWorld',
			templateSet: 'gone',
			status: 'active',
		} as WorldInfo;

		const result = auditWorld(app, world, []);
		expect(result.templateSetMissing).toBe(true);
		expect(result.issues.some(i => i.severity === 'error')).toBe(true);
	});

	it('auditWorld reports catalog-type as info', () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(
			'MyWorld/Characters/Aria.md',
			'---\ntags:\n  - character\nname: "Aria"\n---\n\n# Aria\n'
		);

		const set = baseSet({
			fieldSets: {
				Location: [titleField()],
			},
		});
		const world = {
			name: 'MyWorld',
			path: 'MyWorld',
			templateSet: 'defaults',
			status: 'active',
		} as WorldInfo;

		const result = auditWorld(app, world, [set]);
		const catalog = result.issues.filter(i => i.kind === 'catalog-type');
		expect(catalog).toHaveLength(1);
		expect(catalog[0]?.severity).toBe('info');
		expect(catalog[0]?.message.toLowerCase()).toContain('catalog');
	});
});
