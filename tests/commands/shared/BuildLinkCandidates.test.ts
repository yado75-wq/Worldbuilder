import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFolder,
	asTFile,
} from '../../fakes/obsidian';
import { buildFieldCandidates } from '../../../src/commands/shared/EntityContent';
import { FieldDefinition, TemplateSetInfo, WorldInfo } from '../../../src/types';

const WORLD = 'TestWorld';

function linkField(key: string, linkTypes: string[]): FieldDefinition {
	return {
		key,
		label: key,
		mandatory: false,
		type: 'link',
		display: 'property',
		linkTypes,
		linkFolder: linkTypes[0],
		linkFallback: linkTypes[1],
	};
}

function seedWorld(app: App): WorldInfo {
	const vault = app.vault as unknown as FakeVault;
	const indexFile = asTFile(
		vault.seedFile(`${WORLD}/_index.md`, '---\ntags:\n  - world\n---\n')
	);
	const folder = asTFolder(app.vault.getAbstractFileByPath(WORLD)!);
	return {
		name: 'TestWorld',
		path: WORLD,
		folder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};
}

const emptyTemplateSet: TemplateSetInfo = {
	name: 'defaults',
	path: '_system/templates/defaults',
	isValid: true,
	issues: [],
	folderRules: [],
	worldTemplate: [],
	fieldSets: {},
};

describe('buildFieldCandidates link groups', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('groups by chain order with sorted names', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(`${WORLD}/Zeta.md`, '---\ntags:\n  - weapon\n---\n');
		vault.seedFile(`${WORLD}/Alpha.md`, '---\ntags:\n  - weapon\n---\n');
		vault.seedFile(`${WORLD}/Mail.md`, '---\ntags:\n  - armor\n---\n');

		const { linkGroups } = buildFieldCandidates(
			app, world, [linkField('gear', ['Weapon', 'Armor'])], emptyTemplateSet
		);

		expect(linkGroups['gear']).toEqual([
			{ entityType: 'Weapon', names: ['Alpha', 'Zeta'] },
			{ entityType: 'Armor', names: ['Mail'] },
		]);
	});

	it('keeps empty groups for types with no notes', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(`${WORLD}/Mail.md`, '---\ntags:\n  - armor\n---\n');

		const { linkGroups } = buildFieldCandidates(
			app, world, [linkField('gear', ['Weapon', 'Armor'])], emptyTemplateSet
		);

		expect(linkGroups['gear']).toEqual([
			{ entityType: 'Weapon', names: [] },
			{ entityType: 'Armor', names: ['Mail'] },
		]);
	});

	it('excludes the given basename', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(`${WORLD}/Iron.md`, '---\ntags:\n  - faction\n---\n');
		vault.seedFile(`${WORLD}/Steel.md`, '---\ntags:\n  - faction\n---\n');

		const { linkGroups } = buildFieldCandidates(
			app, world, [linkField('faction', ['Faction'])], emptyTemplateSet, 'Iron'
		);

		expect(linkGroups['faction']).toEqual([
			{ entityType: 'Faction', names: ['Steel'] },
		]);
	});
});