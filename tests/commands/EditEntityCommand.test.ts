import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import {
	FakeVault,	
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { editEntity } from '../../src/commands/EditEntityCommand';
import { FieldDefinition } from '../../src/types/fields';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types';
import { PRESERVED_SECTION_MARKER } from '../../src/util/PreservedSection';
import { DEFAULT_ENTITY_NOTES } from '../../src/commands/shared/EntityContentBuilder';

// ── Modal stub ────────────────────────────────────────────────────────────

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

// ── Fixtures ──────────────────────────────────────────────────────────────

const WORLD_PATH = 'TestWorld';
const ENTITIES_FOLDER = `${WORLD_PATH}/Entities`;

const SIMPLE_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
];

/** Field set with no title field — hits the command guard. */
const NO_TITLE_FIELDS: FieldDefinition[] = [
	{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
];

function entityFile(name: string, race?: string, preserved?: string): string {
	const fmRace = race ? `\nrace: "${race}"` : '';
	const bodyRace = race ? `\n\n- **Race:** ${race}` : '';
	const notes = preserved ?? DEFAULT_ENTITY_NOTES;
	return (
		`---\n` +
		`tags:\n` +
		`  - character\n` +
		`name: "${name}"` +
		`${fmRace}\n` +
		`---\n\n` +
		`# ${name}` +
		`${bodyRace}\n\n` +
		`${PRESERVED_SECTION_MARKER}\n\n` +
		`${notes}\n`
	);
}

function buildState(
	app: App,
	opts?: {
		templateSets?: TemplateSetInfo[];
		fields?: FieldDefinition[];
	}
): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const fields = opts?.fields ?? SIMPLE_FIELDS;

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Character', targetFolder: 'Entities' }],
		worldTemplate: [],
		fieldSets: { Character: fields },
	};

	const templateSets = opts?.templateSets ?? [templateSet];

	const indexFile = asTFile(
		vault.seedFile(
			`${WORLD_PATH}/_index.md`,
			'---\ntags:\n  - world\nname: "TestWorld"\n---\n'
		)
	);
	vault.seedFolder(ENTITIES_FOLDER);

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: templateSets[0]?.name ?? 'defaults',		
		worldTemplate: [],
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('editEntity', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		modalBehavior = { type: 'cancel' };
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFile(`${ENTITIES_FOLDER}/Aria.md`, entityFile('Aria', 'Elf'));

		const result = await editEntity(app, state, 'MissingWorld', 'Character', `${ENTITIES_FOLDER}/Aria.md`);
		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});

	it('exits when no template set is available', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'defaults';
		vault.seedFile(`${ENTITIES_FOLDER}/Aria.md`, entityFile('Aria'));

		const result = await editEntity(app, state, WORLD_PATH, 'Character', `${ENTITIES_FOLDER}/Aria.md`);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });		
	});

	it('exits when entity type has no fields', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		state.templateSets[0]!.fieldSets = {};
		vault.seedFile(`${ENTITIES_FOLDER}/Aria.md`, entityFile('Aria'));

		const result = await editEntity(app, state, WORLD_PATH, 'Character', `${ENTITIES_FOLDER}/Aria.md`);
		expect(result).toMatchObject({ ok: false, code: 'type-not-usable' });		
	});

	it('exits when the field set has no title field', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, { fields: NO_TITLE_FIELDS });
		vault.seedFile(`${ENTITIES_FOLDER}/Aria.md`, entityFile('Aria', 'Elf'));

		const result = await editEntity(app, state, WORLD_PATH, 'Character', `${ENTITIES_FOLDER}/Aria.md`);

		expect(result).toMatchObject({ ok: false, code: 'type-not-usable' });
		expect(vault.contentAt(`${ENTITIES_FOLDER}/Aria.md`)).toContain('Elf');
	});

	it('exits when file is not found', async () => {
		const state = buildState(app);

		const result = await editEntity(app, state, WORLD_PATH, 'Character', `${ENTITIES_FOLDER}/Missing.md`);
		expect(result).toMatchObject({ ok: false, code: 'file-not-found' });
	});
	
	// ── Modal outcomes ────────────────────────────────────────────────────

	it('leaves file unchanged when the form is cancelled', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(path, entityFile('Aria', 'Elf', 'USER NOTES'));
		modalBehavior = { type: 'cancel' };

		const result = await editEntity(app, state, WORLD_PATH, 'Character', path);

		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(vault.contentAt(path)).toContain('USER NOTES');
		expect(vault.contentAt(path)).toContain('Elf');
	});

	it('rejects empty name and does not modify the file', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(path, entityFile('Aria', 'Elf'));
		modalBehavior = {
			type: 'submit',
			data: { name: null, race: 'Orc' },
		};

		const result = await editEntity(app, state, WORLD_PATH, 'Character', path);

		expect(result).toEqual({ ok: false, code: 'name-required' });
		expect(vault.contentAt(path)).toContain('Elf');
		expect(vault.contentAt(path)).not.toContain('Orc');
	});

	it('rejects whitespace-only name and does not modify the file', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(path, entityFile('Aria', 'Elf'));
		modalBehavior = {
			type: 'submit',
			data: { name: '   ', race: 'Orc' },
		};

		const result = await editEntity(app, state, WORLD_PATH, 'Character', path);

		expect(result).toEqual({ ok: false, code: 'name-required' });
		expect(vault.contentAt(path)).toContain('Elf');
	});

	it('updates the file in place when the name is unchanged', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(path, entityFile('Aria', 'Elf', '## Notes\n\nKeep me.'));
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria', race: 'Human' },
		};

		const result = await editEntity(app, state, WORLD_PATH, 'Character', path);

		expect(result).toEqual({ ok: true, path });
		const content = vault.contentAt(path) ?? '';
		expect(app.vault.getAbstractFileByPath(path)).toBeInstanceOf(TFile);
		expect(content).toContain('name: "Aria"');
		expect(content).toContain('Human');
		expect(content).not.toContain('Elf');
		// Marker present → content below it is preserved
		expect(content).toContain(PRESERVED_SECTION_MARKER);
		expect(content).toContain('Keep me.');		
	});

	it('renames the file when the title changes', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const oldPath = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(oldPath, entityFile('Aria', 'Elf'));
		modalBehavior = {
			type: 'submit',
			data: { name: 'Aria the Bold', race: 'Elf' },
		};

		const result = await editEntity(app, state, WORLD_PATH, 'Character', oldPath);
		
		expect(app.vault.getAbstractFileByPath(oldPath)).toBeNull();
		const newPath = `${ENTITIES_FOLDER}/Aria the Bold.md`;
		expect(result).toEqual({ ok: true, path: newPath });
		expect(app.vault.getAbstractFileByPath(oldPath)).toBeNull();
		expect(app.vault.getAbstractFileByPath(newPath)).toBeInstanceOf(TFile);
		const content = vault.contentAt(newPath) ?? '';
		expect(content).toContain('name: "Aria the Bold"');
		expect(content).toContain('# Aria the Bold');		
	});

	it('does not rename when the target name already exists', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${ENTITIES_FOLDER}/Aria.md`;
		vault.seedFile(path, entityFile('Aria', 'Elf'));
		vault.seedFile(`${ENTITIES_FOLDER}/Borin.md`, entityFile('Borin', 'Dwarf'));
		modalBehavior = {
			type: 'submit',
			data: { name: 'Borin', race: 'Elf' },
		};

		const result = await editEntity(app, state, WORLD_PATH, 'Character', path);

		expect(result).toMatchObject({ ok: false, code: 'rename-conflict' });
		expect(app.vault.getAbstractFileByPath(path)).toBeInstanceOf(TFile);
		expect(vault.contentAt(path)).toContain('Elf');
		expect(vault.contentAt(`${ENTITIES_FOLDER}/Borin.md`)).toContain('Dwarf');
	});
});