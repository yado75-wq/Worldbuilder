import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile,  } from 'obsidian';
import { FakeVault, resetFakeObsidian, FakeNoticeLog, asTFile,	asTFolder } from '../fakes/obsidian';
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

	const indexFile = asTFile(
		vault.seedFile(
			`${WORLD_PATH}/_index.md`,
			'---\ntags:\n  - world\nname: "Michal"\n---\n'
		)
	);

	for (const rule of templateSet.folderRules) {
		vault.seedFolder(`${WORLD_PATH}/${rule.targetFolder}`);
	}

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

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

function factionFile(name: string): string {
	return `---\ntags:\n  - faction\nname: "${name}"\n---\n\n# ${name}\n`;
}

function genericFile(name: string): string {
	return `---\ntags:\n  - generic\nname: "${name}"\n---\n\n# ${name}\n`;
}

function untaggedFile(name: string): string {
	return `---\nname: "${name}"\n---\n\n# ${name}\n`;
}

function unknownTagFile(name: string): string {
	return `---\ntags:\n  - artifact\nname: "${name}"\n---\n\n# ${name}\n`;
}

async function waitForSelector(selector: string, timeoutMs = 1000): Promise<Element> {
	const start = Date.now();
	for (;;) {
		const el = document.querySelector(selector);
		if (el) return el;
		if (Date.now() - start > timeoutMs) {
			throw new Error(`Timeout waiting for ${selector}`);
		}
		await new Promise(r => window.setTimeout(r, 0));
	}
}

/** Start the command and confirm once the modal is in the DOM. */
async function runAndConfirm(app: App, state: PluginState): Promise<void> {
	const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
	const btn = await waitForSelector('.wb-confirm-btn-primary') as HTMLButtonElement;
	btn.click();
	await resultPromise;
}

/** Start the command and cancel once the modal is in the DOM. */
async function runAndCancel(app: App, state: PluginState): Promise<void> {
	const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
	const btn = await waitForSelector('.wb-confirm-btn-secondary') as HTMLButtonElement;
	btn.click();
	await resultPromise;
}

describe('syncWorldFiles', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	// ── Already covered behaviour ─────────────────────────────────────────

	it('does not move a file already in its correct one-level-deep folder', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Characters/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(FakeNoticeLog.some(m => m.includes('All files are in correct folders'))).toBe(true);
	});

	it('moves a misplaced but one-level-deep file to its correct folder', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await runAndConfirm(app, state);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeNull();
	});

	it('finds and moves a correctly-tagged entity sitting directly in the world root', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await runAndConfirm(app, state);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('finds and moves a correctly-tagged entity nested more than one level deep', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Time/Sub/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await runAndConfirm(app, state);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('cancelling the confirmation leaves every file exactly where it was', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await runAndCancel(app, state);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeNull();
	});

	// ── New cases ─────────────────────────────────────────────────────────

	it('moves multiple misplaced files in one run', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		vault.seedFile(`${WORLD_PATH}/Characters/IronLeague.md`, factionFile('IronLeague'));
		const { state } = buildState(app);

		await runAndConfirm(app, state);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/IronLeague.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeNull();
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/IronLeague.md`)).toBeNull();
	});

	it('skips files tagged "generic"', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Notes/Scratch.md`, genericFile('Scratch'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		// Still in original location
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/Scratch.md`)).toBeInstanceOf(TFile);
		expect(FakeNoticeLog.some(m => m.includes('All files are in correct folders'))).toBe(true);
	});

	it('skips files whose name starts with underscore', async () => {
		const vault = app.vault as unknown as FakeVault;
		// Even if tagged as character, underscore-prefixed files are ignored
		vault.seedFile(`${WORLD_PATH}/_draft.md`, characterFile('Draft'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/_draft.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/_draft.md`)).toBeNull();
	});

	it('leaves unrecognized tagged files in place and reports them', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Relics/Sword.md`, unknownTagFile('Sword'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Relics/Sword.md`)).toBeInstanceOf(TFile);
		expect(FakeNoticeLog.some(m => m.includes('unrecognized'))).toBe(true);
	});

	it('does not move a file when the target folder already has a name conflict', async () => {
		const vault = app.vault as unknown as FakeVault;
		// Correct location already occupied
		vault.seedFile(`${WORLD_PATH}/Characters/Aria.md`, characterFile('Aria'));
		// Misplaced duplicate
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		await runAndConfirm(app, state);

		// Original stays, misplaced one is not moved (conflict)
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeInstanceOf(TFile);
		expect(FakeNoticeLog.some(m => m.includes('Failed') || m.includes('conflict'))).toBe(true);
	});

		it('does not move a file when the target folder is missing', async () => {
		// Build a minimal world that has the Character rule but no Characters/ folder
		const app2 = new App();
		const v = app2.vault as unknown as FakeVault;

		v.seedFile(`${WORLD_PATH}/_index.md`, '---\ntags:\n  - world\nname: "Michal"\n---\n');
		v.seedFile(`${WORLD_PATH}/Aria.md`, characterFile('Aria'));
		// deliberately do NOT seed Characters/
		
		const worldFolder = asTFolder(app2.vault.getAbstractFileByPath(WORLD_PATH)!);
		const indexFile = asTFile(app2.vault.getAbstractFileByPath(`${WORLD_PATH}/_index.md`)!);

		const state2: PluginState = {
			activeWorld: null,
			worlds: [{
				name: 'Michal',
				path: WORLD_PATH,
				folder: worldFolder,
				indexFile,
				status: 'active',
				templateSet: 'defaults',
				folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
				worldTemplate: [],
			}],
			templateSets: [{
				name: 'defaults',
				path: '_system/templates/defaults',
				isValid: true,
				issues: [],
				folderRules: [{ entityType: 'Character', targetFolder: 'Characters' }],
				worldTemplate: [],
				fieldSets: {},
			}],
		};

		await runAndConfirm(app2, state2);

		// File stays in the root because the target folder does not exist
		expect(app2.vault.getAbstractFileByPath(`${WORLD_PATH}/Aria.md`)).toBeInstanceOf(TFile);
		expect(app2.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeNull();
		expect(FakeNoticeLog.some(m => m.includes('Failed') || m.includes('missing'))).toBe(true);
	});

	it('shows a notice and does nothing when the world path is unknown', async () => {
		const { state } = buildState(app);

		await syncWorldFiles(app, state, 'DoesNotExist');

		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('ignores untagged markdown files', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Notes/Readme.md`, untaggedFile('Readme'));
		const { state } = buildState(app);

		await syncWorldFiles(app, state, WORLD_PATH);

		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/Readme.md`)).toBeInstanceOf(TFile);
		expect(FakeNoticeLog.some(m => m.includes('All files are in correct folders'))).toBe(true);
	});
});