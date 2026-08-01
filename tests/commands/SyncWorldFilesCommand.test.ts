import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { FakeVault, resetFakeObsidian } from '../fakes/obsidian';
import { syncWorldFiles } from '../../src/commands/SyncWorldFilesCommand';
import { PluginState, TemplateSetInfo, WorldInfo } from '../../src/types';

/**
 * These tests run the REAL command function against an in-memory fake of
 * the actual `obsidian` npm package's API shape (tests/fakes/obsidian.ts) —
 * not a hand-guessed stub. `tsc` still checks every `obsidian` import here
 * against the real, verified type definitions; only the runtime is
 * substituted (vitest.config.ts's alias).
 */

const WORLD_PATH = 'Michal';

function buildState(app: App): { state: PluginState; world: WorldInfo; templateSet: TemplateSetInfo } {
	const vault = app.vault as unknown as FakeVault;

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [
			{ entityType: 'Character', targetFolder: 'Characters' },
			{ entityType: 'Faction', targetFolder: 'Factions' },
		],
		worldTemplate: [],
		fieldSets: {},
	};

	// seedFile returns our fake TFile. WorldInfo expects the real TFile from
	// the obsidian package. The double cast bridges the two types intentionally
	// for the test harness — the runtime objects are compatible.
	const indexFile = vault.seedFile(
		`${WORLD_PATH}/_index.md`,
		'---\ntags:\n  - world\nname: "Michal"\n---\n'
	) as unknown as TFile;

	for (const rule of templateSet.folderRules) {
		vault.seedFolder(`${WORLD_PATH}/${rule.targetFolder}`);
	}

	// Same situation: getAbstractFileByPath returns the fake TFolder,
	// WorldInfo.folder is typed as the real TFolder.
	const worldFolder = app.vault.getAbstractFileByPath(WORLD_PATH) as TFolder;

	const world: WorldInfo = {
		name: 'Michal',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',
		folderRules: templateSet.folderRules,
		worldTemplate: [],
	};

	const state: PluginState = {
		activeWorld: world,
		worlds: [world],
		templateSets: [templateSet],
	};

	return { state, world, templateSet };
}

function characterFile(name: string): string {
	return `---\ntags:\n  - character\nname: "${name}"\n---\n\n# ${name}\n`;
}

describe('syncWorldFiles', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('does not move a file already in its correct one-level-deep folder', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Characters/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('moves a misplaced but one-level-deep file to its correct folder (existing, already-working behavior)', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria')); // tagged character, sitting in Factions/
		const { state } = buildState(app);

		// syncWorldFiles runs synchronously up to `await askConfirm(...)` — the
		// confirm modal's DOM already exists by the time this call returns a
		// pending promise, so the button must be clicked before awaiting it,
		// not after (awaiting first would deadlock: the command can't finish
		// until the button is clicked, and the button can't be found until
		// the command has started).
		const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
		document.querySelector<HTMLButtonElement>('.wb-confirm-btn-primary')?.click();
		await resultPromise;

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeNull();
	});

	it('finds and moves a correctly-tagged entity sitting directly in the world root (previously undiscovered)', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
		document.querySelector<HTMLButtonElement>('.wb-confirm-btn-primary')?.click();
		await resultPromise;

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('finds and moves a correctly-tagged entity nested more than one level deep (previously undiscovered)', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Time/Sub/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
		document.querySelector<HTMLButtonElement>('.wb-confirm-btn-primary')?.click();
		await resultPromise;

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('cancelling the confirmation leaves every file exactly where it was', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
		document.querySelector<HTMLButtonElement>('.wb-confirm-btn-secondary')?.click();
		await resultPromise;

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeInstanceOf(TFile);
	});
});
