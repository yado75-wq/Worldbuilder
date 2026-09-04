import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,	
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { newWorld } from '../../src/commands/NewWorldCommand';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import {
	DEFAULT_SETTINGS,
	PluginState,	
	WorldBuilderSettings,	
} from '../../src/types/runtime';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';
// ── Modal stubs ───────────────────────────────────────────────────────────

let inputResult: string | null = null;
let confirmResult = false;

vi.mock('../../src/formkit', () => ({
	InputModal: class {
		onSubmit: (value: string) => void;
		onCancel: () => void;

		constructor(
			_app: unknown,
			_prompt: string,
			_placeholder: string,
			_initial: string,
			onSubmit: (value: string) => void,
			onCancel: () => void
		) {
			this.onSubmit = onSubmit;
			this.onCancel = onCancel;
		}

		open(): void {
			queueMicrotask(() => {
				if (inputResult === null) {
					this.onCancel();
				} else {
					this.onSubmit(inputResult);
				}
			});
		}
	},
}));

vi.mock('../../src/ui/ConfirmModal', () => ({
	ConfirmModal: class {
		onConfirm: (confirmed: boolean) => void;

		constructor(
			_app: unknown,
			_prompt: string,
			onConfirm: (confirmed: boolean) => void
		) {
			this.onConfirm = onConfirm;
		}

		open(): void {
			queueMicrotask(() => {
				this.onConfirm(confirmResult);
			});
		}
	},
}));

vi.mock('../../src/commands/RefreshDashboardCommand', () => ({
	refreshDashboard: vi.fn(async () => {}),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

function validTemplateSet(overrides?: Partial<TemplateSetInfo>): TemplateSetInfo {
	return {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [
			{ entityType: 'Character', targetFolder: 'Characters' },
		],
		worldTemplate: ['Characters', 'Factions', 'Time'],
		fieldSets: {},
		...overrides,
	};
}

function buildState(app: App, opts?: {
	templateSets?: TemplateSetInfo[];
	existingActiveWorld?: boolean;
}): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const templateSets = opts?.templateSets ?? [validTemplateSet()];

	const worlds: WorldInfo[] = [];
	let activeWorld: WorldInfo | null = null;

	if (opts?.existingActiveWorld) {
		const indexFile = asTFile(
			vault.seedFile(
				'OldWorld/_index.md',
				'---\ntags:\n  - world\nstatus: active\ntemplate_set: defaults\nname: "OldWorld"\n---\n\n# OldWorld\n'
			)
		);
		const folder = asTFolder(app.vault.getAbstractFileByPath('OldWorld')!);
		activeWorld = {
			name: 'OldWorld',
			path: 'OldWorld',
			folder,
			indexFile,
			status: 'active',
			templateSet: 'defaults',			
			worldTemplate: [],
		};
		worlds.push(activeWorld);
	}

	return {
		activeWorld,
		worlds,
		templateSets,
	};
}

const settings: WorldBuilderSettings = {
	...DEFAULT_SETTINGS,
	defaultTemplateSet: 'defaults',
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('newWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		inputResult = null;
		confirmResult = false;
		setCatalogForTests(en);
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when no template sets exist', async () => {		
		const result = await newWorld(app, settings, buildState(app, { templateSets: [] }), '');
		expect(result).toEqual({ ok: false, code: 'no-template-sets' });
	});

	it('exits when the resolved template set is invalid', async () => {
		const result = await newWorld(app, settings, buildState(app, {
			templateSets: [validTemplateSet({ isValid: false, issues: [{ severity: 'error', kind: 'other', message: 'broken' }] })],
		}), '');
		expect(result).toMatchObject({ ok: false, code: 'template-set-invalid' });
	});

	it('creates nothing when the name dialog is cancelled', async () => {
		inputResult = null;
		const result = await newWorld(app, settings, buildState(app), '');
		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(app.vault.getAbstractFileByPath('My World')).toBeNull();
	});

	it('exits when a folder with that name already exists', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFolder('Existing');
		inputResult = 'Existing';
		confirmResult = false;

		const result = await newWorld(app, settings, state, '');
		expect(result).toMatchObject({ ok: false, code: 'already-exists' });
	});

	// ── Creation ──────────────────────────────────────────────────────────

	it('creates world folder, template subfolders, and inactive _index.md', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		inputResult = 'NewWorld';
		confirmResult = false; // do not make active

		const result = await newWorld(app, settings, state, '');
		expect(result).toEqual({ ok: true, path: 'NewWorld', madeActive: false });

		expect(app.vault.getAbstractFileByPath('NewWorld')).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath('NewWorld/Characters')).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath('NewWorld/Factions')).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath('NewWorld/Time')).toBeInstanceOf(TFolder);

		const index = vault.contentAt('NewWorld/_index.md') ?? '';
		expect(index).toContain('name: "NewWorld"');
		expect(index).toContain('status: inactive');
		expect(index).toContain('template_set: defaults');
		expect(index).toContain('# NewWorld');		
	});

	it('creates an active world and deactivates the previous active world', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, { existingActiveWorld: true });
		inputResult = 'NewWorld';
		confirmResult = true;

		const result = await newWorld(app, settings, state, '');
		expect(result).toEqual({ ok: true, path: 'NewWorld', madeActive: true });

		const newIndex = vault.contentAt('NewWorld/_index.md') ?? '';
		expect(newIndex).toContain('status: active');
		
		const oldIndex = vault.contentAt('OldWorld/_index.md') ?? '';
		expect(oldIndex).toContain('status: inactive');
	});

	it('creates the world under parentPath when provided', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFolder('Campaigns');
		const state = buildState(app);
		inputResult = 'Realm';
		confirmResult = false;

		const result = await newWorld(app, settings, state, 'Campaigns');
		expect(result).toEqual({ ok: true, path: 'Campaigns/Realm', madeActive: false });
		expect(app.vault.getAbstractFileByPath('Campaigns/Realm')).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath('Campaigns/Realm/_index.md')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('Realm')).toBeNull();
	});

	it('rejects a world name with leading underscore', async () => {
		const state = buildState(app);
		inputResult = '_Archived';
		confirmResult = false;

		const result = await newWorld(app, settings, state, '');
		expect(result).toEqual({ ok: false, code: 'leading-underscore', detail: '_Archived' });
		expect(app.vault.getAbstractFileByPath('_Archived')).toBeNull();
	});
});