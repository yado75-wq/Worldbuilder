import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { switchToWorld } from '../../src/commands/SwitchWorldCommand';
import { PluginState, WorldInfo } from '../../src/types';

const WORLD_A = 'WorldA';
const WORLD_B = 'WorldB';

function indexContent(name: string, status: 'active' | 'inactive'): string {
	return (
		`---\n` +
		`tags:\n` +
		`  - world\n` +
		`status: ${status}\n` +
		`template_set: defaults\n` +
		`name: "${name}"\n` +
		`---\n\n` +
		`# ${name}\n`
	);
}

function buildState(app: App): PluginState {
	const vault = app.vault as unknown as FakeVault;

	const indexA = asTFile(vault.seedFile(`${WORLD_A}/_index.md`, indexContent('WorldA', 'active')));
	const indexB = asTFile(vault.seedFile(`${WORLD_B}/_index.md`, indexContent('WorldB', 'inactive')));

	const folderA = asTFolder(app.vault.getAbstractFileByPath(WORLD_A)!);
	const folderB = asTFolder(app.vault.getAbstractFileByPath(WORLD_B)!);

	const worldA: WorldInfo = {
		name: 'WorldA',
		path: WORLD_A,
		folder: folderA,
		indexFile: indexA,
		status: 'active',
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};

	const worldB: WorldInfo = {
		name: 'WorldB',
		path: WORLD_B,
		folder: folderB,
		indexFile: indexB,
		status: 'inactive',
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};

	return {
		activeWorld: worldA,
		worlds: [worldA, worldB],
		templateSets: [],
	};
}

describe('switchToWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('exits when the world is not found', async () => {
		const state = buildState(app);

		await switchToWorld(app, state, 'Missing');

		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('exits when the target is already active', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		await switchToWorld(app, state, WORLD_A);

		expect(FakeNoticeLog.some(m => m.includes('already the active world'))).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: active');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: inactive');
	});

	it('activates the target and deactivates the previous active world', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);

		await switchToWorld(app, state, WORLD_B);

		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: inactive');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: active');
		expect(FakeNoticeLog.some(m => m.includes('Switched to') && m.includes('WorldB'))).toBe(true);
	});
});