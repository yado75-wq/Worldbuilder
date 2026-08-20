import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { createEntity } from '../../src/commands/CreateEntityCommand';
import { PluginState, TemplateSetInfo, WorldInfo, FieldDefinition } from '../../src/types';

// ── Modal stub (no UI) ────────────────────────────────────────────────────

type ModalBehavior =
	| { type: 'cancel' }
	| { type: 'submit'; data: Record<string, string | null> };

let modalBehavior: ModalBehavior = { type: 'cancel' };

vi.mock('../../src/ui/EntityFormModal', () => ({
	EntityFormModal: class {
		options: {
			onSubmit: (r: { data: Record<string, string | null> }) => void;
			onCancel: () => void;
		};

		constructor(
			_app: unknown,
			options: {
				onSubmit: (r: { data: Record<string, string | null> }) => void;
				onCancel: () => void;
			}
		) {
			this.options = options;
		}

		open(): void {
			queueMicrotask(() => {
				if (modalBehavior.type === 'cancel') {
					this.options.onCancel();
				} else {
					this.options.onSubmit({ data: modalBehavior.data });
				}
			});
		}
	},
}));

vi.mock('../../src/commands/RefreshDashboardCommand', () => ({
	refreshDashboard: vi.fn(async () => {}),
}));

// ── Textbook field sets ───────────────────────────────────────────────────

const WORLD_PATH = 'TestWorld';
const ENTITIES_FOLDER = `${WORLD_PATH}/Entities`;
const MILESTONES_FOLDER = `${WORLD_PATH}/Milestones`;
const MIXED_FOLDER = `${WORLD_PATH}/Mixed`;
const GENERICS_FOLDER = `${WORLD_PATH}/Generics`;

const GENERIC_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
];

const SIMPLE_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
];

const MILESTONE_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'time', label: 'Time', type: 'timeframe', display: 'property', mandatory: true },
];

const SELECT_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'status', label: 'Status', type: 'select', display: 'property', mandatory: false, options: ['Alive', 'Dead'] },
];

const LINK_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'faction', label: 'Faction', type: 'link', display: 'property', mandatory: false, linkFolder: 'Factions' },
];

const SECTION_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'background', label: 'Background', type: 'text', display: 'section', mandatory: false },
];

const ALL_TYPES_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
	{ key: 'status', label: 'Status', type: 'select', display: 'property', mandatory: false, options: ['Alive', 'Dead'] },
	{ key: 'faction', label: 'Faction', type: 'link', display: 'property', mandatory: false, linkFolder: 'Factions' },
	{ key: 'background', label: 'Background', type: 'text', display: 'section', mandatory: false },
	{ key: 'time', label: 'Time', type: 'timeframe', display: 'property', mandatory: false },
];

function buildState(
	app: App,
	opts: {
		entityType: string;
		folderName: string;
		fields: FieldDefinition[];
		templateSets?: TemplateSetInfo[];
	}
): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const folderPath = `${WORLD_PATH}/${opts.folderName}`;

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [
			{ entityType: opts.entityType, targetFolder: opts.folderName },
		],
		worldTemplate: [],
		fieldSets: {
			[opts.entityType]: opts.fields,
		},
	};

	const templateSets = opts.templateSets ?? [templateSet];

	const indexFile = asTFile(
		vault.seedFile(
			`${WORLD_PATH}/_index.md`,
			'---\ntags:\n  - world\nname: "TestWorld"\n---\n'
		)
	);
	vault.seedFolder(folderPath);

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: templateSets[0]?.name ?? 'defaults',
		folderRules: templateSet.folderRules,
		worldTemplate: [],
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

describe('createEntity', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		modalBehavior = { type: 'cancel' };
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});

		const result = await createEntity(app, state, 'MissingWorld', 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});

	it('exits when no template set is available', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
			templateSets: [],
		});
		state.worlds[0]!.templateSet = 'defaults';

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });
	});

	it('exits when world template set name is missing from registry', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		state.worlds[0]!.templateSet = 'gone';

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toMatchObject({ ok: false, code: 'missing-template-set', detail: 'gone' });
	});

	it('exits when entity type has no fields', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		state.templateSets[0]!.fieldSets = {};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toMatchObject({ ok: false, code: 'type-not-usable' });
	});

	it('exits when entity type has fields but no title', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: [
				{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
			],
		});

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toMatchObject({ ok: false, code: 'type-not-usable' });
		expect(app.vault.getAbstractFileByPath(`${ENTITIES_FOLDER}/Aria.md`)).toBeNull();
	});

	// ── Modal outcomes ────────────────────────────────────────────────────

	it('creates nothing when the form is cancelled', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		modalBehavior = { type: 'cancel' };

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(app.vault.getAbstractFileByPath(`${ENTITIES_FOLDER}/Aria.md`)).toBeNull();
	});

	it('rejects empty name', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: null, race: 'Elf' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: false, code: 'name-required' });
		expect(
			(app.vault as unknown as FakeVault)
				.getFiles()
				.filter(f => f.path.startsWith(ENTITIES_FOLDER + '/') && f.extension === 'md')
				.length
		).toBe(0);
	});

	it('rejects whitespace-only name', async () => {
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: '   ', race: null },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: false, code: 'name-required' });
	});

	it('does not overwrite an existing file', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		vault.seedFile(`${ENTITIES_FOLDER}/Aria.md`, 'ORIGINAL\n');
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', race: 'Elf' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toMatchObject({ ok: false, code: 'already-exists' });
		expect(vault.contentAt(`${ENTITIES_FOLDER}/Aria.md`)).toContain('ORIGINAL');
	});

	it('creates entity with name and optional text property', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', race: 'Elf' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		expect(result).toEqual({ ok: true, path });
		expect(app.vault.getAbstractFileByPath(path)).toBeInstanceOf(TFile);

		const content = vault.contentAt(path) ?? '';
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('- character');
		expect(content).toContain('# Aria');
		expect(content).toContain('Elf');
	});

	it('creates entity with only the name field set', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SIMPLE_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Borin', race: null },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: true, path: `${ENTITIES_FOLDER}/Borin.md` });

		const content = vault.contentAt(`${ENTITIES_FOLDER}/Borin.md`) ?? '';
		expect(content).toContain('name: "Borin"');
		expect(content).toContain('# Borin');
		expect(content).not.toContain('**Race:**');
	});

	// ── Isolated field types ──────────────────────────────────────────────

	it('creates an entity with only a title field', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Generic',
			folderName: 'Generics',
			fields: GENERIC_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Note1' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Generic', GENERICS_FOLDER);
		const path = `${GENERICS_FOLDER}/Note1.md`;
		expect(result).toEqual({ ok: true, path });
		expect(app.vault.getAbstractFileByPath(path)).toBeInstanceOf(TFile);

		const content = vault.contentAt(path) ?? '';
		expect(content).toContain('name: "Note1"');
		expect(content).toContain('- generic');
		expect(content).toContain('# Note1');
	});

	it('creates an entity with a select property', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SELECT_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', status: 'Alive' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: true, path: `${ENTITIES_FOLDER}/Aria.md` });

		const content = vault.contentAt(`${ENTITIES_FOLDER}/Aria.md`) ?? '';
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('Alive');
	});

	it('creates an entity with a link property', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: LINK_FIELDS,
		});
		vault.seedFolder(`${WORLD_PATH}/Factions`);
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', faction: '[[IronLeague]]' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: true, path: `${ENTITIES_FOLDER}/Aria.md` });

		const content = vault.contentAt(`${ENTITIES_FOLDER}/Aria.md`) ?? '';
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('[[IronLeague]]');
	});

	it('creates an entity with a section field', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Character',
			folderName: 'Entities',
			fields: SECTION_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', background: 'Born in the woods.' },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Character', ENTITIES_FOLDER);
		expect(result).toEqual({ ok: true, path: `${ENTITIES_FOLDER}/Aria.md` });

		const content = vault.contentAt(`${ENTITIES_FOLDER}/Aria.md`) ?? '';
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('Born in the woods.');
	});

	it('creates a milestone when the field set includes a timeframe field', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Milestone',
			folderName: 'Milestones',
			fields: MILESTONE_FIELDS,
		});
		modalBehavior = {
			type: 'submit',
			data: { name: 'Founding', time: null },
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Milestone', MILESTONES_FOLDER);
		const path = `${MILESTONES_FOLDER}/Founding.md`;
		expect(result).toEqual({ ok: true, path });

		const content = vault.contentAt(path) ?? '';
		expect(content).toContain('name: "Founding"');
		expect(content).toContain('- milestone');
	});

	it('creates an entity with text, select, link, section, and timeframe fields together', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			entityType: 'Mixed',
			folderName: 'Mixed',
			fields: ALL_TYPES_FIELDS,
		});
		vault.seedFolder(`${WORLD_PATH}/Factions`);
		modalBehavior = {
			type: 'submit',
			data: {
				name: 'Aria',
				race: 'Elf',
				status: 'Alive',
				faction: '[[IronLeague]]',
				background: 'Born in the woods.',
				time: null,
			},
		};

		const result = await createEntity(app, state, WORLD_PATH, 'Mixed', MIXED_FOLDER);
		const path = `${MIXED_FOLDER}/Aria.md`;
		expect(result).toEqual({ ok: true, path });

		const content = vault.contentAt(path) ?? '';
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('- mixed');
		expect(content).toContain('Elf');
		expect(content).toContain('Alive');
		expect(content).toContain('[[IronLeague]]');
		expect(content).toContain('Born in the woods.');
	});
});