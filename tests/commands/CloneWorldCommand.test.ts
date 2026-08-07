import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { cloneWorld } from '../../src/commands/CloneWorldCommand';
import { PluginState, WorldInfo } from '../../src/types';

let inputResult: string | null = null;

vi.mock('../../src/ui/InputModal', () => ({
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
				if (inputResult === null) this.onCancel();
				else this.onSubmit(inputResult);
			});
		}
	},
}));

vi.mock('../../src/commands/RefreshDashboardCommand', () => ({
	refreshDashboard: vi.fn(async () => {}),
}));

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

function buildState(app: App, folderName: string): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const indexFile = asTFile(
		vault.seedFile(`${folderName}/_index.md`, indexContent(folderName, 'active'))
	);
	vault.seedFile(
		`${folderName}/Characters/Aria.md`,
		'---\ntags:\n  - character\nname: "Aria"\n---\n\n# Aria\n'
	);
	const folder = asTFolder(app.vault.getAbstractFileByPath(folderName)!);

	// Vault-root parent: path "/" (the bug we hit in Obsidian)
	folder.parent = asTFolder(vault.seedFolder(''));
	(folder.parent as { path: string }).path = '/';

	const world: WorldInfo = {
		name: folderName,
		path: folderName,
		folder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',
		folderRules: [],
		worldTemplate: [],
	};

	return { activeWorld: world, worlds: [world], templateSets: [] };
}

describe('cloneWorld', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		inputResult = null;
	});

	it('does nothing when name dialog is cancelled', async () => {
		const state = buildState(app, 'Misko');
		inputResult = null;

		await cloneWorld(app, state, 'Misko');

		expect(app.vault.getAbstractFileByPath('Misko-copy')).toBeNull();
	});

	it('creates a sibling folder without a double-slash path when parent is /', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, 'Misko');
		inputResult = 'Misko-copy';

		await cloneWorld(app, state, 'Misko');

		expect(app.vault.getAbstractFileByPath('//Misko-copy')).toBeNull();
		expect(app.vault.getAbstractFileByPath('Misko-copy')).toBeInstanceOf(TFolder);
		expect(app.vault.getAbstractFileByPath('Misko-copy/_index.md')).not.toBeNull();

		const content = vault.contentAt('Misko-copy/_index.md') ?? '';
		expect(content).toContain('status: inactive');
		expect(content).toContain('name: "Misko-copy"');
		expect(content).toContain('# Misko-copy');
		expect(FakeNoticeLog.some(m => m.includes('created') && m.includes('inactive'))).toBe(true);
	});

	it('copies nested files into the clone', async () => {
		const state = buildState(app, 'Misko');
		inputResult = 'Misko-copy';

		await cloneWorld(app, state, 'Misko');

		expect(
			app.vault.getAbstractFileByPath('Misko-copy/Characters/Aria.md')
		).not.toBeNull();
	});

	it('refuses to clone onto an existing path', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app, 'Misko');
		vault.seedFolder('Misko-copy');
		inputResult = 'Misko-copy';

		await cloneWorld(app, state, 'Misko');

		expect(FakeNoticeLog.some(m => m.includes('already exists'))).toBe(true);
	});
});