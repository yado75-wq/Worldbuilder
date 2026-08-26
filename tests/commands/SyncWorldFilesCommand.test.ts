import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import { FakeVault, resetFakeObsidian, asTFile, asTFolder } from '../fakes/obsidian';
import { syncWorldFiles } from '../../src/commands/SyncWorldFilesCommand';
import { TemplateSetInfo } from "../../src/types/templateSet";
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types';

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

async function runAndConfirm(app: App, state: PluginState) {
	const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
	const btn = await waitForSelector('.wb-confirm-btn-primary') as HTMLButtonElement;
	btn.click();
	return resultPromise;
}

async function runAndCancel(app: App, state: PluginState) {
	const resultPromise = syncWorldFiles(app, state, WORLD_PATH);
	const btn = await waitForSelector('.wb-confirm-btn-secondary') as HTMLButtonElement;
	btn.click();
	return resultPromise;
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

		const result = await syncWorldFiles(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: false, code: 'nothing-to-move' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('moves a misplaced but one-level-deep file to its correct folder', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const result = await runAndConfirm(app, state);

		expect(result).toMatchObject({ ok: true });
		if (result.ok) expect(result.moved).toContain('Aria');
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeNull();
	});

	it('finds and moves a correctly-tagged entity sitting directly in the world root', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const result = await runAndConfirm(app, state);

		expect(result).toMatchObject({ ok: true });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('finds and moves a correctly-tagged entity nested more than one level deep', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Time/Sub/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const result = await runAndConfirm(app, state);

		expect(result).toMatchObject({ ok: true });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('cancelling the confirmation leaves every file exactly where it was', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const result = await runAndCancel(app, state);

		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeNull();
	});

	it('moves multiple misplaced files in one run', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		vault.seedFile(`${WORLD_PATH}/Characters/IronLeague.md`, factionFile('IronLeague'));
		const { state } = buildState(app);

		const result = await runAndConfirm(app, state);

		expect(result).toMatchObject({ ok: true });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/IronLeague.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeNull();
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/IronLeague.md`)).toBeNull();
	});

	it('skips files tagged "generic"', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Notes/Scratch.md`, genericFile('Scratch'));
		const { state } = buildState(app);

		const result = await syncWorldFiles(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: false, code: 'nothing-to-move' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/Scratch.md`)).toBeInstanceOf(TFile);
	});

	it('skips files whose name starts with underscore', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/_draft.md`, characterFile('Draft'));
		const { state } = buildState(app);

		const result = await syncWorldFiles(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: false, code: 'nothing-to-move' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/_draft.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/_draft.md`)).toBeNull();
	});

	it('leaves unrecognized tagged files in place and reports them', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Relics/Sword.md`, unknownTagFile('Sword'));
		const { state } = buildState(app);

		const result = await syncWorldFiles(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: false, code: 'nothing-to-move' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Relics/Sword.md`)).toBeInstanceOf(TFile);
	});

	it('does not move a file when the target folder already has a name conflict', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Characters/Aria.md`, characterFile('Aria'));
		vault.seedFile(`${WORLD_PATH}/Factions/Aria.md`, characterFile('Aria'));
		const { state } = buildState(app);

		const result = await runAndConfirm(app, state);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.failed.length).toBeGreaterThan(0);
			expect(result.moved).not.toContain('Aria');
		}
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeInstanceOf(TFile);
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Factions/Aria.md`)).toBeInstanceOf(TFile);
	});

	it('does not move a file when the target folder is missing', async () => {
		const app2 = new App();
		const v = app2.vault as unknown as FakeVault;

		v.seedFile(`${WORLD_PATH}/_index.md`, '---\ntags:\n  - world\nname: "Michal"\n---\n');
		v.seedFile(`${WORLD_PATH}/Aria.md`, characterFile('Aria'));

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

		const result = await runAndConfirm(app2, state2);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.failed.length).toBeGreaterThan(0);
			expect(result.moved).not.toContain('Aria');
		}
		expect(app2.vault.getAbstractFileByPath(`${WORLD_PATH}/Aria.md`)).toBeInstanceOf(TFile);
		expect(app2.vault.getAbstractFileByPath(`${WORLD_PATH}/Characters/Aria.md`)).toBeNull();
	});

	it('shows a notice and does nothing when the world path is unknown', async () => {
		const { state } = buildState(app);

		const result = await syncWorldFiles(app, state, 'DoesNotExist');

		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});

	it('ignores untagged markdown files', async () => {
		const vault = app.vault as unknown as FakeVault;
		vault.seedFile(`${WORLD_PATH}/Notes/Readme.md`, untaggedFile('Readme'));
		const { state } = buildState(app);

		const result = await syncWorldFiles(app, state, WORLD_PATH);

		expect(result).toMatchObject({ ok: false, code: 'nothing-to-move' });
		expect(app.vault.getAbstractFileByPath(`${WORLD_PATH}/Notes/Readme.md`)).toBeInstanceOf(TFile);
	});
});