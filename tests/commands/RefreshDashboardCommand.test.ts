import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	FakeVault,	
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { refreshDashboard } from '../../src/commands/RefreshDashboardCommand';
import { FieldDefinition } from '../../src/types/fields';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types/runtime';
import { PRESERVED_SECTION_MARKER } from '../../src/util/PreservedSection';
import { DEFAULT_DASHBOARD_NOTES } from '../../src/commands/shared/DashboardContentBuilder';

const WORLD_PATH = 'TestWorld';
const DASH_PATH = `${WORLD_PATH}/_dashboard.md`;
const CHARACTERS = `${WORLD_PATH}/Characters`;

const CHARACTER_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: true },
];

function indexContent(opts?: { genre?: string; todo?: string }): string {
	const genre = opts?.genre ? `\ngenre: "${opts.genre}"` : '';
	const todo = opts?.todo
		? `\n\n## TODO\n${opts.todo}`
		: '\n\n## TODO\n- Write the opening';
	return (
		`---\n` +
		`tags:\n` +
		`  - world\n` +
		`status: active\n` +
		`template_set: defaults\n` +
		`name: "TestWorld"` +
		`${genre}\n` +
		`---\n\n` +
		`# TestWorld` +
		`${todo}\n`
	);
}

function buildState(app: App, opts?: {
	templateSets?: TemplateSetInfo[];
	index?: string;
}): PluginState {
	const vault = app.vault as unknown as FakeVault;

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
		worldTemplate: [],
		fieldSets: { Character: CHARACTER_FIELDS },
	};

	const templateSets = opts?.templateSets ?? [templateSet];

	const indexFile = asTFile(
		vault.seedFile(`${WORLD_PATH}/_index.md`, opts?.index ?? indexContent())
	);
	vault.seedFolder(CHARACTERS);

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',		
		worldTemplate: [],
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

describe('refreshDashboard', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app);
		const result = await refreshDashboard(app, state, 'Missing');

		expect(result).toEqual({ ok: false, code: 'world-not-found' });
		expect(app.vault.getAbstractFileByPath(DASH_PATH)).toBeNull();
	});

	it('exits when the world template set is not found', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'missing-set';

		const result = await refreshDashboard(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });
	});

	it('exits when world points at a missing template set name', async () => {
		const state = buildState(app); // still has defaults
		state.worlds[0]!.templateSet = 'gone';

		const result = await refreshDashboard(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'missing-template-set', detail: 'gone' });
	});
	// ── Create / update ───────────────────────────────────────────────────

	it('creates _dashboard.md when it does not exist', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			index: indexContent({ genre: 'Fantasy', todo: '- Outline act 1' }),
		});

		const result = await refreshDashboard(app, state, WORLD_PATH, false);

		expect(result).toEqual({ ok: true, path: DASH_PATH });
		expect(app.vault.getAbstractFileByPath(DASH_PATH)).toBeInstanceOf(TFile);
		const content = vault.contentAt(DASH_PATH) ?? '';
		expect(content).toContain('tags:');
		expect(content).toContain('- dashboard');
		expect(content).toContain('world: "TestWorld"');
		expect(content).toContain('# TestWorld — Dashboard');
		expect(content).toContain('## World meta');
		expect(content).toContain('Fantasy');
		expect(content).toContain('## TODO');
		expect(content).toContain('Outline act 1');
		expect(content).toContain('## Needs attention');
		expect(content).toContain('## Characters (0)');
		expect(content).toContain('_No entries yet._');
		expect(content).toContain(PRESERVED_SECTION_MARKER);
		expect(content).toContain(DEFAULT_DASHBOARD_NOTES.split('\n')[0]!);		
	});

	it('preserves notes below the marker when updating an existing dashboard', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		vault.seedFile(
			DASH_PATH,
			`---\ntags:\n  - dashboard\nworld: "TestWorld"\n---\n\n# old\n\n${PRESERVED_SECTION_MARKER}\n\n## Notes\n\nKeep this.\n`
		);

		await refreshDashboard(app, state, WORLD_PATH, false);

		const content = vault.contentAt(DASH_PATH) ?? '';
		expect(content).toContain('# TestWorld — Dashboard');
		expect(content).toContain(PRESERVED_SECTION_MARKER);
		expect(content).toContain('Keep this.');
		expect(content).not.toContain('# old');
	});

	it('lists entities under their folder section', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		vault.seedFile(
			`${CHARACTERS}/Aria.md`,
			'---\ntags:\n  - character\nname: "Aria"\nrace: "Elf"\n---\n\n# Aria\n'
		);

		await refreshDashboard(app, state, WORLD_PATH, false);

		const content = vault.contentAt(DASH_PATH) ?? '';
		expect(content).toContain('## Characters (1)');
		expect(content).toContain('Aria');
		expect(content).not.toContain('_No entries yet._');
	});

	it('reports missing mandatory fields under Needs attention', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		// race is mandatory — omit it
		vault.seedFile(
			`${CHARACTERS}/Borin.md`,
			'---\ntags:\n  - character\nname: "Borin"\n---\n\n# Borin\n'
		);

		await refreshDashboard(app, state, WORLD_PATH, false);

		const content = vault.contentAt(DASH_PATH) ?? '';
		expect(content).toContain('## Needs attention');
		expect(content).toContain('Borin');
		expect(content).toContain('missing:');
		expect(content).toContain('Race');
	});

	it('still writes when openAfterRefresh is false', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		const result = await refreshDashboard(app, state, WORLD_PATH, false);
		expect(result).toEqual({ ok: true, path: DASH_PATH });
		expect(app.vault.getAbstractFileByPath(DASH_PATH)).toBeInstanceOf(TFile);
		expect(vault.contentAt(DASH_PATH)).toContain('Dashboard');		
	});
});