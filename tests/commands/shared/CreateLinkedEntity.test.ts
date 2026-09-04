import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../../fakes/obsidian';
import { createLinkedEntity } from '../../../src/commands/shared/CreateLinkedEntity';
import { FieldDefinition } from '../../../src/formkit';
import { TemplateSetInfo } from '../../../src/types/templateSet';
import { WorldInfo } from '../../../src/types/world';
import { PluginState } from '../../../src/types/runtime';
import { setCatalogForTests } from '../../../src/i18n';
import en from '../../../locales/en.json';

vi.mock('../../../src/commands/RefreshDashboardCommand', () => ({
	refreshDashboard: vi.fn(async () => {}),
	worldDashboardPath: (worldPath: string) => `${worldPath}/_dashboard.md`,
}));

const WORLD = 'TestWorld';
const CHAR_FOLDER = `${WORLD}/Characters`;

function linkField(entityType: string): FieldDefinition {
	return {
		key: 'faction',
		label: 'Faction',
		mandatory: false,
		type: 'link',
		display: 'property',
		linkTypes: [entityType],
		linkFolder: entityType,
	};
}

function buildState(
	app: App,
	folderRules: TemplateSetInfo['folderRules'],
	fieldSets: TemplateSetInfo['fieldSets'] = {}
): { state: PluginState; world: WorldInfo; templateSet: TemplateSetInfo } {
	const vault = app.vault as unknown as FakeVault;
	const indexFile = asTFile(
		vault.seedFile(`${WORLD}/_index.md`, '---\ntags:\n  - world\n---\n')
	);
	vault.seedFolder(CHAR_FOLDER);

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules,
		worldTemplate: [],
		fieldSets,
	};

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD,
		folder: asTFolder(app.vault.getAbstractFileByPath(WORLD)!),
		indexFile,
		status: 'active',
		templateSet: 'defaults',		
		worldTemplate: [],
	};

	return {
		state: { activeWorld: world, worlds: [world], templateSets: [templateSet] },
		world,
		templateSet,
	};
}

describe('createLinkedEntity', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);
	});

	it('places the file under the concrete folder rule for the type', async () => {
		const { state, world, templateSet } = buildState(app, [
			{ entityType: 'Faction', targetFolder: 'Factions' },
		]);

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, linkField('Faction'), 'Iron League'
		);

		expect(result).toEqual({
			ok: true,
			link: '[[Iron League]]',
			path: `${WORLD}/Factions/Iron League.md`,
		});
		expect(app.vault.getAbstractFileByPath(`${WORLD}/Factions/Iron League.md`)).toBeInstanceOf(TFile);
	});

	it('places the file in the current entity folder when the type has no concrete rule', async () => {
		const { state, world, templateSet } = buildState(app, [
			{ entityType: 'Faction', targetFolder: '*' },
		]);

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, linkField('Faction'), 'Solo'
		);

		expect(result).toMatchObject({ ok: true, path: `${CHAR_FOLDER}/Solo.md` });
		expect(app.vault.getAbstractFileByPath(`${CHAR_FOLDER}/Solo.md`)).toBeInstanceOf(TFile);
	});

	it('places the file in the current entity folder when the type is unlisted', async () => {
		const { state, world, templateSet } = buildState(app, []);

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, linkField('Faction'), 'Unlisted'
		);

		expect(result).toMatchObject({ ok: true, path: `${CHAR_FOLDER}/Unlisted.md` });
		expect(app.vault.getAbstractFileByPath(`${CHAR_FOLDER}/Unlisted.md`)).toBeInstanceOf(TFile);
	});

	it('does not overwrite an existing file', async () => {
		const vault = app.vault as unknown as FakeVault;
		const { state, world, templateSet } = buildState(app, [
			{ entityType: 'Faction', targetFolder: 'Factions' },
		]);
		vault.seedFile(`${WORLD}/Factions/Iron.md`, 'ORIGINAL\n');

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, linkField('Faction'), 'Iron'
		);

		expect(result).toMatchObject({ ok: false, code: 'already-exists' });
		expect(vault.contentAt(`${WORLD}/Factions/Iron.md`)).toContain('ORIGINAL');
	});

	it('returns no-link-type when the field has no link type', async () => {
		const { state, world, templateSet } = buildState(app, []);
		const field: FieldDefinition = {
			key: 'x',
			label: 'X',
			mandatory: false,
			type: 'link',
			display: 'property',
		};

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, field, 'Nope'
		);

		expect(result).toEqual({ ok: false, code: 'no-link-type' });
	});

	it('rejects a name with leading underscore', async () => {
		const { state, world, templateSet } = buildState(app, [
			{ entityType: 'Faction', targetFolder: 'Factions' },
		]);

		const result = await createLinkedEntity(
			app, state, world, templateSet, CHAR_FOLDER, linkField('Faction'), '_Secret'
		);

		expect(result).toEqual({ ok: false, code: 'leading-underscore', detail: '_Secret' });
		expect(app.vault.getAbstractFileByPath(`${WORLD}/Factions/_Secret.md`)).toBeNull();
	});
});