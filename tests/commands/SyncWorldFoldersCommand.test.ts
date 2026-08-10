import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { syncWorldFolders } from '../../src/commands/SyncWorldFoldersCommand';
import { PluginState, TemplateSetInfo, WorldInfo } from '../../src/types';

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
		folderRules: templateSet.folderRules,
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

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app);

		await syncWorldFolders(app, state, 'Missing');

		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('exits when template set is not found', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'missing-set';

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(FakeNoticeLog.some(m => m.includes('Template set') && m.includes('not found'))).toBe(true);
	});

	// ── Create ────────────────────────────────────────────────────────────

	it('creates missing folders from worldTemplate', async () => {
		const state = buildState(app, { seedTemplateFolders: false });

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions`)).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Locations`)).toBeInstanceOf(TFolder);
		expect(FakeNoticeLog.some(m => m.includes('Created'))).toBe(true);
	});

	it('keeps existing template folders and reports them as Kept', async () => {
		const state = buildState(app, { seedTemplateFolders: true });

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
		expect(FakeNoticeLog.some(m => m.includes('Kept'))).toBe(true);
	});

	// ── Delete empty extras ───────────────────────────────────────────────

	it('removes empty folders that are not in worldTemplate', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFolder(`${WORLD_PATH}/OrphanEmpty`);

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/OrphanEmpty`)).toBeNull();
		expect(FakeNoticeLog.some(m => m.includes('Removed empty') && m.includes('OrphanEmpty'))).toBe(true);
	});

	it('does not remove non-empty folders outside the template', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFile(`${WORLD_PATH}/Notes/readme.md`, '# hi\n');

        const trashSpy = vi.spyOn(app.fileManager, 'trashFile').mockResolvedValue();

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/readme.md`)).not.toBeNull();
		expect(trashSpy).not.toHaveBeenCalled();
	});

	it('does not remove template folders even if empty', async () => {
		const state = buildState(app, {
			worldTemplate: ['Characters'],
			seedTemplateFolders: true,
		});

		const trashSpy = vi.fn(async () => {});
		(app.fileManager as unknown as { trashFile: (f: unknown) => Promise<void> }).trashFile = trashSpy;

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters`)).toBeInstanceOf(TFolder);
		expect(trashSpy).not.toHaveBeenCalled();
	});

	it('reports No changes needed when template folders exist and nothing extra', async () => {
		const state = buildState(app, { seedTemplateFolders: true });

		await syncWorldFolders(app, state, WORLD_PATH);

		// All template folders already present → Kept; if no deletes/creates only Kept
		expect(
			FakeNoticeLog.some(m => m.includes('Kept') || m.includes('No changes needed'))
		).toBe(true);
	});

	it('does nothing when worldTemplate is empty (no create, no delete)', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, {
			worldTemplate: [],
			seedTemplateFolders: false,
		});
		vault.seedFolder(`${WORLD_PATH}/OrphanEmpty`);

		const trashSpy = vi.spyOn(app.fileManager, 'trashFile').mockResolvedValue();

		await syncWorldFolders(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/OrphanEmpty`)).toBeInstanceOf(TFolder);
		expect(trashSpy).not.toHaveBeenCalled();
		expect(FakeNoticeLog.some(m => m.includes('World template is empty'))).toBe(true);
	});
});