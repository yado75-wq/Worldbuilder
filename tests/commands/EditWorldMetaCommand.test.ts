import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,	
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { editWorldMeta } from '../../src/commands/EditWorldMetaCommand';
import { FieldDefinition } from '../../src/formkit';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types/runtime';

// ── Modal stub ────────────────────────────────────────────────────────────

type ModalBehavior =
	| { type: 'cancel' }
	| { type: 'submit'; data: Record<string, string | null> };

let modalBehavior: ModalBehavior = { type: 'cancel' };

vi.mock('../../src/formkit', () => ({
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
	worldDashboardPath: (worldPath: string) => `${worldPath}/_dashboard.md`,
}));

// ── WorldMeta field set (mirrors WorldMeta_Fields.md) ─────────────────────

const WORLD_PATH = 'TestWorld';
const INDEX_PATH = `${WORLD_PATH}/_index.md`;

/**
 * Same shape as WorldMeta_Fields.md.
 * `name` is title — filtered out of the meta form; must never be driven by submit data.
 */
const WORLD_META_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'genre', label: 'Genre', type: 'text', display: 'property', mandatory: false },
	{ key: 'tone', label: 'Tone', type: 'text', display: 'property', mandatory: false },
	{ key: 'themes', label: 'Themes', type: 'text', display: 'property', mandatory: false },
	{ key: 'audience', label: 'Target Audience', type: 'text', display: 'property', mandatory: false },
	{ key: 'magic', label: 'Magic System', type: 'text', display: 'property', mandatory: false },
	{ key: 'time_unit', label: 'Time Unit', type: 'text', display: 'property', mandatory: false },
	{ key: 'time_zero', label: 'Time Zero', type: 'text', display: 'property', mandatory: false },
	{ key: 'premise', label: 'Premise / Hook', type: 'text', display: 'section', mandatory: false },
	{ key: 'conflict', label: 'Central Conflict', type: 'text', display: 'section', mandatory: false },
	{ key: 'avoid', label: 'Things to Avoid', type: 'text', display: 'section', mandatory: false },
	{ key: 'todo', label: 'TODO', type: 'text', display: 'section', mandatory: false },
	{ key: 'notes', label: 'Author Notes', type: 'text', display: 'section', mandatory: false },
];

function indexFile(opts?: {
	name?: string;
	status?: string;
	templateSet?: string;
	genre?: string;
	premise?: string;
}): string {
	const name = opts?.name ?? 'TestWorld';
	const status = opts?.status ?? 'active';
	const templateSet = opts?.templateSet ?? 'defaults';
	const genreLine = opts?.genre ? `\ngenre: "${opts.genre}"` : '';
	const premiseBlock = opts?.premise ? `\n\n## Premise / Hook\n${opts.premise}` : '';

	return (
		`---\n` +
		`tags:\n` +
		`  - world\n` +
		`status: ${status}\n` +
		`template_set: ${templateSet}\n` +
		`name: "${name}"` +
		`${genreLine}\n` +
		`---\n\n` +
		`# ${name}` +
		`${premiseBlock}\n`
	);
}

function buildState(app: App, opts?: {
	templateSets?: TemplateSetInfo[];
	worldMetaFields?: FieldDefinition[];
	indexContent?: string;
	worldName?: string;
	status?: 'active' | 'inactive';
	templateSetName?: string;
}): PluginState {
	const vault = app.vault as unknown as FakeVault;

	const templateSet: TemplateSetInfo = {
		name: opts?.templateSetName ?? 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [],
		worldTemplate: [],
		fieldSets: {
			WorldMeta: opts?.worldMetaFields ?? WORLD_META_FIELDS,
		},
	};

	const templateSets = opts?.templateSets ?? [templateSet];
	const worldName = opts?.worldName ?? 'TestWorld';
	const status: 'active' | 'inactive' = opts?.status ?? 'active';

	const indexContent =
		opts?.indexContent ??
		indexFile({
			name: worldName,
			status,
			templateSet: templateSet.name,
		});

	const index = asTFile(vault.seedFile(INDEX_PATH, indexContent));
	const worldFolder = asTFolder(
		app.vault.getAbstractFileByPath(WORLD_PATH) ?? vault.seedFolder(WORLD_PATH)
	);

	const world: WorldInfo = {
		name: worldName,
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile: index,
		status,
		templateSet: templateSet.name,		
		worldTemplate: [],
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('editWorldMeta', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		modalBehavior = { type: 'cancel' };
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app);
		const result = await editWorldMeta(app, state, 'MissingWorld');
		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});
	
	it('exits when no template set is available', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'defaults';
		const result = await editWorldMeta(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });
	});

	it('exits when WorldMeta field set is missing or empty', async () => {
		const state = buildState(app, { worldMetaFields: [] });
		const result = await editWorldMeta(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'worldmeta-empty' });
	});

	// ── Modal outcomes ────────────────────────────────────────────────────

	it('leaves _index.md unchanged when the form is cancelled', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			indexContent: indexFile({ name: 'TestWorld', genre: 'Fantasy' }),
		});
		modalBehavior = { type: 'cancel' };

		const result = await editWorldMeta(app, state, WORLD_PATH);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(vault.contentAt(INDEX_PATH)).toContain('Fantasy');
	});

	it('updates meta properties without changing world name, status, or template_set', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			worldName: 'TestWorld',
			status: 'active',
			templateSetName: 'defaults',
			indexContent: indexFile({
				name: 'TestWorld',
				status: 'active',
				templateSet: 'defaults',
				genre: 'Fantasy',
			}),
		});

		modalBehavior = {
			type: 'submit',
			data: {
				// name is not in the form fields (filtered), but if present must be ignored
				name: 'TestWorld',
				genre: 'Horror',
				tone: 'Dark',
				themes: null,
				audience: null,
				magic: null,
				time_unit: 'years',
				time_zero: null,
				premise: null,
				conflict: null,
				avoid: null,
				todo: null,
				notes: null,
			},
		};

		const result = await editWorldMeta(app, state, WORLD_PATH);

		expect(result).toEqual({ ok: true, path: WORLD_PATH });
		const content = vault.contentAt(INDEX_PATH) ?? '';
		expect(content).toContain('name: "TestWorld"');
		expect(content).toContain('# TestWorld');
		expect(content).not.toContain('HackedName');
		expect(content).toContain('status: active');
		expect(content).toContain('template_set: defaults');
		expect(content).toContain('Horror');
		expect(content).toContain('Dark');
		expect(content).toContain('years');
		expect(content).not.toContain('Fantasy');		
	});

	it('writes section fields into the index body', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			indexContent: indexFile({ name: 'TestWorld' }),
		});

		modalBehavior = {
			type: 'submit',
			data: {
				name: 'TestWorld',
				genre: null,
				tone: null,
				themes: null,
				audience: null,
				magic: null,
				time_unit: null,
				time_zero: null,
				premise: 'A dying star and a last ship.',
				conflict: null,
				avoid: null,
				todo: null,
				notes: null,
			},
		};

		const result = await editWorldMeta(app, state, WORLD_PATH);
		expect(result).toEqual({ ok: true, path: WORLD_PATH });

		const content = vault.contentAt(INDEX_PATH) ?? '';
		expect(content).toContain('## Premise / Hook');
		expect(content).toContain('A dying star and a last ship.');
		expect(content).toContain('name: "TestWorld"');
	});
    
    it('omits a property from the index when it is cleared', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			indexContent: indexFile({
				name: 'TestWorld',
				status: 'active',
				templateSet: 'defaults',
				genre: 'Fantasy',
			}),
		});

		modalBehavior = {
			type: 'submit',
			data: {
				name: 'TestWorld',
				genre: null,
				tone: null,
				themes: null,
				audience: null,
				magic: null,
				time_unit: null,
				time_zero: null,
				premise: null,
				conflict: null,
				avoid: null,
				todo: null,
				notes: null,
			},
		};

		const result = await editWorldMeta(app, state, WORLD_PATH);
		expect(result).toEqual({ ok: true, path: WORLD_PATH });

		const content = vault.contentAt(INDEX_PATH) ?? '';
		expect(content).toContain('name: "TestWorld"');
		expect(content).toContain('status: active');
		expect(content).toContain('template_set: defaults');
		expect(content).not.toContain('Fantasy');
		expect(content).not.toContain('genre:');
		
	});
});