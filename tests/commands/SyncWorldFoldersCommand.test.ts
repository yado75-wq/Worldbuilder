import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { syncWorldFolders } from '../../src/commands/SyncWorldFoldersCommand';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types';

const WORLD_PATH = 'TestWorld';

function buildState(app: App, opts?: {
	worldTemplate?: string[];
	templateSets?: TemplateSetInfo[];
	seedTemplateFolders?: boolean;
}): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const worldTemplate = opts?.worldTemplate ?? ['Characters', 'Factions', 'Locations'];

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [
			{ entityType: 'Character', targetFolder: 'Characters' },
			{ entityType: 'Faction', targetFolder: 'Factions' },
		],
		worldTemplate,
		fieldSets: {},
	};

	const templateSets = opts?.templateSets ?? [templateSet];

	const indexFile = asTFile(
		vault.seedFile(
			`${WORLD_PATH}/_index.md`,
			'---\ntags:\n  - world\nstatus: active\ntemplate_set: defaults\nname: "TestWorld"\n---\n\n# TestWorld\n'
		)
	);

	if (opts?.seedTemplateFolders !== false) {
		for (const sub of worldTemplate) {
			vault.seedFolder(`${WORLD_PATH}/${sub}`);
		}
	}

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',		
		worldTemplate,
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

describe('syncWorldFolders', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('exits when world is not found', async () => {
		const state = buildState(app);
		const result = await syncWorldFolders(app, state, 'Missing');
		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});

	it('exits when template set is not found', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'missing-set';
		const result = await syncWorldFolders(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });
	});

	it('creates missing folders from worldTemplate', async () => {
		const state = buildState(app, { seedTemplateFolders: false });
		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.created).toEqual(expect.arrayContaining(['Characters', 'Factions', 'Locations']));
		}
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions`)).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Locations`)).toBeInstanceOf(TFolder);
	});

	it('keeps existing template folders and reports them as Kept', async () => {
		const state = buildState(app, { seedTemplateFolders: true });
		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.kept).toEqual(expect.arrayContaining(['Characters', 'Factions', 'Locations']));
			expect(result.created).toEqual([]);
		}
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
	});

	it('removes empty folders that are not in worldTemplate', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFolder(`${WORLD_PATH}/OrphanEmpty`);

		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) expect(result.deleted).toContain('OrphanEmpty');
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/OrphanEmpty`)).toBeNull();
	});

	it('does not remove non-empty folders outside the template', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFile(`${WORLD_PATH}/Notes/readme.md`, '# hi\n');
		const trashSpy = vi.spyOn(app.fileManager, 'trashFile').mockResolvedValue();

		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/readme.md`)).not.toBeNull();
		expect(trashSpy).not.toHaveBeenCalled();
	});

	it('does not remove template folders even if empty', async () => {
		const state = buildState(app, {
			worldTemplate: ['Characters'],
			seedTemplateFolders: true,
		});
		const trashSpy = vi.spyOn(app.fileManager, 'trashFile').mockResolvedValue();

		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
		expect(trashSpy).not.toHaveBeenCalled();
	});

	it('reports No changes needed when template folders exist and nothing extra', async () => {
		const state = buildState(app, { seedTemplateFolders: true });
		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) {
			expect(result.created).toEqual([]);
			expect(result.deleted).toEqual([]);
			expect(result.kept.length).toBeGreaterThan(0);
		}
	});

	it('does nothing when worldTemplate is empty (no create, no delete)', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			worldTemplate: [],
			seedTemplateFolders: false,
		});
		vault.seedFolder(`${WORLD_PATH}/OrphanEmpty`);
		const trashSpy = vi.spyOn(app.fileManager, 'trashFile').mockResolvedValue();

		const result = await syncWorldFolders(app, state, WORLD_PATH);

		expect(result).toEqual({ ok: false, code: 'empty-world-template' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/OrphanEmpty`)).toBeInstanceOf(TFolder);
		expect(trashSpy).not.toHaveBeenCalled();
	});
});