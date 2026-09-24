import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
} from '../fakes/obsidian';
import {
	buildSuggestFieldsPreview,
	formatSuggestFieldsReport,
	suggestFieldsFromWorlds,
	collectNoteSamples,
} from '../../src/commands/SuggestFieldsFromWorldsCommand';
import { ensureDefaultTemplates, cloneTemplateSet } from '../../src/commands/SetupCommand';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState, DEFAULT_SETTINGS } from '../../src/types/runtime';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';
import { asTFile, asTFolder } from '../fakes/obsidian';

const PLUGIN_DIR = 'plugin-root';

function seedDefaults(vault: FakeVault): void {
	const files = [
		'world-template.md',
		'folder-rules.md',
		'WorldMeta_Fields.md',
		'Generic_Fields.md',
		'Character_Fields.md',
		'Location_Fields.md',
		'Faction_Fields.md',
	];
	for (const f of files) {
		const body =
			f === 'Generic_Fields.md'
				? 'name | Name | mandatory | text | title\n'
				: f === 'Character_Fields.md'
					? 'name | Name | mandatory | text | title\nrace | Race | optional | text | property\n'
					: `# ${f}\n`;
		vault.adapter.seedExternal(`${PLUGIN_DIR}/defaults/${f}`, body);
	}
}

function characterSet(): TemplateSetInfo {
	return {
		name: 'fantasy',
		path: '_system/templates/fantasy',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
		worldTemplate: [],
		fieldSets: {
			Generic: [
				{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
			],
			Character: [
				{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
				{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
			],
		},
	};
}

function makeWorld(app: App, path: string, setName: string): WorldInfo {
	const vault = app.vault as unknown as FakeVault;
	vault.seedFolder(path);
	const index = vault.seedFile(
		`${path}/_index.md`,
		`---\ntags:\n  - world\nstatus: inactive\ntemplate_set: ${setName}\n---\n`
	);
	const folder = vault.getAbstractFileByPath(path);
	return {
		name: path,
		path,
		folder: asTFolder(folder),
		indexFile: asTFile(index),
		status: 'inactive',
		templateSet: setName,
		worldTemplate: [],
	};
}

describe('SuggestFieldsFromWorlds', () => {
	let app: App;
	let vault: FakeVault;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as FakeVault;
		resetFakeObsidian();
		setCatalogForTests(en);
		seedDefaults(vault);
	});

	it('collectNoteSamples skips _ files and indexes', () => {
		const world = makeWorld(app, 'W', 'fantasy');
		vault.seedFile(
			'W/Characters/Aria.md',
			'---\ntags:\n  - character\nname: Aria\nfaction: "[[Guild]]"\n---\n'
		);
		vault.seedFile('W/_dashboard.md', '---\ntags:\n  - character\nname: Dash\n---\n');
		vault.seedFile('W/_index.md', '---\ntags:\n  - world\n---\n');

		const samples = collectNoteSamples(app, [world]);
		expect(samples.every(s => !s.path.includes('_dashboard'))).toBe(true);
		expect(samples.some(s => s.typeTag === 'character')).toBe(true);
	});

	it('buildSuggestFieldsPreview uses Generic + notes, not full source Character kit', () => {
		const set = characterSet();
		const world = makeWorld(app, 'W', 'fantasy');
		vault.seedFile(
			'W/A.md',
			'---\ntags:\n  - character\nname: Aria\nfaction: "[[Guild]]"\n---\n'
		);
		vault.seedFile(
			'W/B.md',
			'---\ntags:\n  - character\nname: Bor\nfaction: "[[Order]]"\n---\n'
		);

		const preview = buildSuggestFieldsPreview(app, set, [world], 'fantasy-suggested');
		expect(preview).not.toBeNull();
		const ch = preview!.types.find(t => t.typeName === 'Character' || t.typeTag === 'character');
		expect(ch).toBeDefined();
		const keys = ch!.fieldsToWrite.map(f => f.key);
		expect(keys).toContain('name');
		expect(keys).toContain('faction');
		// race is on source template but not on notes — must not appear
		expect(keys).not.toContain('race');
		expect(ch!.keysOnSourceNotInNotes).toContain('race');
	});

	it('formatSuggestFieldsReport mentions Generic and source keys not copied', () => {
		const set = characterSet();
		const world = makeWorld(app, 'W', 'fantasy');
		vault.seedFile(
			'W/A.md',
			'---\ntags:\n  - character\nname: Aria\nfaction: "[[X]]"\n---\n'
		);
		const preview = buildSuggestFieldsPreview(app, set, [world], 'out');
		expect(preview).not.toBeNull();
		const md = formatSuggestFieldsReport(preview!);
		expect(md.toLowerCase()).toMatch(/generic/);
		expect(md).toContain('faction');
		expect(md).toMatch(/race/i); // source key not copied callout
	});

	it('suggestFieldsFromWorlds clones, writes fields, writes _report.md', async () => {
		await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, []);
		await cloneTemplateSet(app, DEFAULT_SETTINGS, 'defaults', 'fantasy');

		// Seed fantasy Character richer than notes
		vault.seedFile(
			'_system/templates/fantasy/Character_Fields.md',
			'name | Name | mandatory | text | title\nrace | Race | optional | text | property\n'
		);
		vault.seedFile(
			'_system/templates/fantasy/Generic_Fields.md',
			'name | Name | mandatory | text | title\n'
		);

		const set = characterSet();
		const world = makeWorld(app, 'W', 'fantasy');
		vault.seedFile(
			'W/A.md',
			'---\ntags:\n  - character\nname: Aria\nfaction: "[[Guild]]"\n---\n'
		);

		const state: PluginState = {
			activeWorld: null,
			worlds: [world],
			templateSets: [set],
		};

		const result = await suggestFieldsFromWorlds(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'fantasy-suggested',
			async () => Promise.resolve(true)
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const fieldsPath = '_system/templates/fantasy-suggested/Character_Fields.md';
		const body = vault.contentAt(fieldsPath) ?? '';
		expect(body).toContain('name');
		expect(body).toContain('faction');
		expect(body).not.toContain('race |');

		const report = vault.contentAt('_system/templates/fantasy-suggested/_report.md') ?? '';
		expect(report.length).toBeGreaterThan(50);
		expect(app.vault.getAbstractFileByPath(fieldsPath)).toBeInstanceOf(TFile);
	});

	it('returns cancelled when confirm is false', async () => {
		const set = characterSet();
		const world = makeWorld(app, 'W', 'fantasy');
		vault.seedFile(
			'W/A.md',
			'---\ntags:\n  - character\nname: Aria\n---\n'
		);
		const state: PluginState = {
			activeWorld: null,
			worlds: [world],
			templateSets: [set],
		};

		const result = await suggestFieldsFromWorlds(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'x',
			async () => Promise.resolve(false)
		);
		expect(result).toMatchObject({ ok: false, code: 'cancelled' });
	});
});
