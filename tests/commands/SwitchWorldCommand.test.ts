import { beforeEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { setActiveWorld, switchToWorld } from '../../src/commands/SwitchWorldCommand';
import { PluginState, WorldInfo } from '../../src/types';

const WORLD_A = 'WorldA';
const WORLD_B = 'WorldB';
const WORLD_C = 'WorldC';

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

function makeWorld(
	app: App,
	path: string,
	name: string,
	status: 'active' | 'inactive'
): WorldInfo {
	const vault = app.vault as unknown as FakeVault;
	const indexFile = asTFile(
		vault.seedFile(`${path}/_index.md`, indexContent(name, status))
	);
	const folder = asTFolder(app.vault.getAbstractFileByPath(path)!);
	return {
		name,
		path,
		folder,
		indexFile,
		status,
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};
}

function stateFrom(worlds: WorldInfo[]): PluginState {
	const active = worlds.filter(w => w.status === 'active');
	return {
		activeWorld: active[0] ?? null,
		worlds,
		templateSets: [],
	};
}

describe('setActiveWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('returns false when the world is not found', async () => {
		const state = stateFrom([makeWorld(app, WORLD_A, 'WorldA', 'active')]);

		const ok = await setActiveWorld(app, state, 'Missing');

		expect(ok).toBe(false);
		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('activates the target and leaves a previously inactive peer inactive', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'inactive');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'inactive');
		const state = stateFrom([a, b]);

		const ok = await setActiveWorld(app, state, WORLD_B);

		expect(ok).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: inactive');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: active');
		expect(FakeNoticeLog.some(m => m.includes('Active world') && m.includes('WorldB'))).toBe(true);
	});

	it('resolves multi-active conflict: only the chosen world stays active on disk', async () => {
		const vault = app.vault as unknown as FakeVault;
		// Both active on disk and in state (copy / manual edit scenario)
		const a = makeWorld(app, WORLD_A, 'WorldA', 'active');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'active');
		const c = makeWorld(app, WORLD_C, 'WorldC', 'inactive');
		const state = stateFrom([a, b, c]);

		const ok = await setActiveWorld(app, state, WORLD_B);

		expect(ok).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: inactive');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: active');
		expect(vault.contentAt(`${WORLD_C}/_index.md`)).toContain('status: inactive');
	});

	it('resolves zero-active: activates the chosen world', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'inactive');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'inactive');
		const state = stateFrom([a, b]);

		const ok = await setActiveWorld(app, state, WORLD_A);

		expect(ok).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: active');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: inactive');
	});

	it('when target is already one of several actives, still deactivates the others', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'active');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'active');
		const state = stateFrom([a, b]);

		// User picks A (already active) as the one to keep
		const ok = await setActiveWorld(app, state, WORLD_A);

		expect(ok).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: active');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: inactive');
	});
});

describe('switchToWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
	});

	it('exits when the world is not found', async () => {
		const state = stateFrom([makeWorld(app, WORLD_A, 'WorldA', 'active')]);

		await switchToWorld(app, state, 'Missing');

		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('exits when the target is already the unique active world', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'active');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'inactive');
		const state = stateFrom([a, b]);

		await switchToWorld(app, state, WORLD_A);

		expect(FakeNoticeLog.some(m => m.includes('already the active world'))).toBe(true);
		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: active');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: inactive');
	});

	it('switches from one active world to another', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'active');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'inactive');
		const state = stateFrom([a, b]);

		await switchToWorld(app, state, WORLD_B);

		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: inactive');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: active');
	});

	it('repairs multi-active conflict when switching to one of the active worlds', async () => {
		const vault = app.vault as unknown as FakeVault;
		const a = makeWorld(app, WORLD_A, 'WorldA', 'active');
		const b = makeWorld(app, WORLD_B, 'WorldB', 'active');
		const state = stateFrom([a, b]);

		// Not "already the unique active" — activeCount is 2, so setActiveWorld runs
		await switchToWorld(app, state, WORLD_B);

		expect(vault.contentAt(`${WORLD_A}/_index.md`)).toContain('status: inactive');
		expect(vault.contentAt(`${WORLD_B}/_index.md`)).toContain('status: active');
		expect(FakeNoticeLog.some(m => m.includes('already the active world'))).toBe(false);
	});
});

/** Pure conflict predicate — same rule as MenuBuilder / settings. */
describe('active world conflict rule', () => {
	function hasActiveWorldConflict(state: PluginState): boolean {
		if (state.worlds.length === 0) return false;
		return state.worlds.filter(w => w.status === 'active').length !== 1;
	}

	it('is false when there are no worlds', () => {
		expect(hasActiveWorldConflict(stateFrom([]))).toBe(false);
	});

	it('is false when exactly one world is active', () => {
		const app = new App();
		const state = stateFrom([
			makeWorld(app, WORLD_A, 'WorldA', 'active'),
			makeWorld(app, WORLD_B, 'WorldB', 'inactive'),
		]);
		expect(hasActiveWorldConflict(state)).toBe(false);
	});

	it('is true when two worlds are active', () => {
		const app = new App();
		const state = stateFrom([
			makeWorld(app, WORLD_A, 'WorldA', 'active'),
			makeWorld(app, WORLD_B, 'WorldB', 'active'),
		]);
		expect(hasActiveWorldConflict(state)).toBe(true);
	});

	it('is true when worlds exist but none are active', () => {
		const app = new App();
		const state = stateFrom([
			makeWorld(app, WORLD_A, 'WorldA', 'inactive'),
			makeWorld(app, WORLD_B, 'WorldB', 'inactive'),
		]);
		expect(hasActiveWorldConflict(state)).toBe(true);
	});
});