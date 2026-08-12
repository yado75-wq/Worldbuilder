import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFolder,
	asTFile,
} from '../../fakes/obsidian';
import { buildLinkCandidates } from '../../../src/commands/shared/EntityContent';
import { FieldDefinition, TemplateSetInfo, WorldInfo } from '../../../src/types';

const WORLD = 'TestWorld';

function factionField(linkTypes: string[]): FieldDefinition {
	return {
		key: 'faction',
		label: 'Faction',
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
		vault.seedFile(
			`${WORLD}/_index.md`,
			'---\ntags:\n  - world\n---\n'
		)
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

describe('buildLinkCandidates (by entity type)', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('lists notes tagged with the primary link type anywhere under the world', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(
			`${WORLD}/Factions/Iron.md`,
			'---\ntags:\n  - faction\nname: "Iron"\n---\n'
		);
		vault.seedFile(
			`${WORLD}/Misc/Loose.md`,
			'---\ntags:\n  - faction\nname: "Loose"\n---\n'
		);
		vault.seedFile(
			`${WORLD}/Factions/Other.md`,
			'---\ntags:\n  - location\nname: "Other"\n---\n'
		);

		const result = buildLinkCandidates(
			app,
			world,
			[factionField(['Faction'])],
			emptyTemplateSet
		);

		expect(result['faction']?.sort()).toEqual(['Iron', 'Loose'].sort());
	});

	it('falls back to the second type when the primary type has no candidates', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(
			`${WORLD}/Places/Town.md`,
			'---\ntags:\n  - location\nname: "Town"\n---\n'
		);

		const result = buildLinkCandidates(
			app,
			world,
			[factionField(['Faction', 'Location'])],
			emptyTemplateSet
		);

		expect(result['faction']).toEqual(['Town']);
	});

	it('excludes the given basename', () => {
		const vault = app.vault as unknown as FakeVault;
		const world = seedWorld(app);
		vault.seedFile(
			`${WORLD}/Factions/Iron.md`,
			'---\ntags:\n  - faction\n---\n'
		);
		vault.seedFile(
			`${WORLD}/Factions/Steel.md`,
			'---\ntags:\n  - faction\n---\n'
		);

		const result = buildLinkCandidates(
			app,
			world,
			[factionField(['Faction'])],
			emptyTemplateSet,
			'Iron'
		);

		expect(result['faction']).toEqual(['Steel']);
	});
});