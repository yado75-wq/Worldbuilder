import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import {
	renameTemplateSet,
	updateTemplateSetFrontmatter,
	worldsUsingTemplateSet,
} from '../../src/commands/RenameTemplateSetCommand';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState, DEFAULT_SETTINGS } from '../../src/types/runtime';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';

function worldIndex(name: string, set: string, status: 'active' | 'inactive' = 'inactive'): string {
	return (
		`---\n` +
		`tags:\n` +
		`  - world\n` +
		`status: ${status}\n` +
		`template_set: ${set}\n` +
		`name: "${name}"\n` +
		`---\n\n` +
		`# ${name}\n`
	);
}

function buildState(
	app: App,
	opts: {
		setName?: string;
		worlds?: Array<{ path: string; set: string; status?: 'active' | 'inactive' }>;
	} = {}
): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const setName = opts.setName ?? 'fantasy';
	const setPath = `_system/templates/${setName}`;
	vault.seedFolder(setPath);
	vault.seedFile(`${setPath}/WorldMeta_Fields.md`, 'name | Name | mandatory | text | title\n');
	vault.seedFile(`${setPath}/Character_Fields.md`, 'name | Name | mandatory | text | title\n');

	const templateSet: TemplateSetInfo = {
		name: setName,
		path: setPath,
		isValid: true,
		issues: [],
		folderRules: [],
		worldTemplate: [],
		fieldSets: {
			Character: [
				{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
			],
		},
	};

	const worldSpecs = opts.worlds ?? [
		{ path: 'WorldA', set: setName, status: 'active' as const },
		{ path: 'WorldB', set: setName, status: 'inactive' as const },
	];

	const worlds: WorldInfo[] = [];
	for (const w of worldSpecs) {
		const indexPath = `${w.path}/_index.md`;
		const indexFile = asTFile(
			vault.seedFile(indexPath, worldIndex(w.path, w.set, w.status ?? 'inactive'))
		);
		const folder = asTFolder(app.vault.getAbstractFileByPath(w.path)!);
		worlds.push({
			name: w.path,
			path: w.path,
			folder,
			indexFile,
			status: w.status ?? 'inactive',
			templateSet: w.set,
			worldTemplate: [],
		});
	}

	return {
		activeWorld: worlds.find(w => w.status === 'active') ?? null,
		worlds,
		templateSets: [templateSet],
	};
}

describe('updateTemplateSetFrontmatter', () => {
	it('replaces existing template_set line', () => {
		const src = worldIndex('W', 'fantasy');
		const out = updateTemplateSetFrontmatter(src, 'fantasy-v2');
		expect(out).toContain('template_set: fantasy-v2');
		expect(out).not.toMatch(/template_set: fantasy\n/);
	});

	it('appends template_set when missing in frontmatter', () => {
		const src = `---\ntags:\n  - world\nname: "W"\n---\n\n# W\n`;
		const out = updateTemplateSetFrontmatter(src, 'fantasy');
		expect(out).toContain('template_set: fantasy');
	});
});

describe('worldsUsingTemplateSet', () => {
	it('filters by exact template_set name', () => {
		const app = new App();
		resetFakeObsidian();
		const state = buildState(app, {
			worlds: [
				{ path: 'A', set: 'fantasy' },
				{ path: 'B', set: 'other' },
			],
		});
		expect(worldsUsingTemplateSet(state.worlds, 'fantasy').map(w => w.path)).toEqual(['A']);
	});
});

describe('renameTemplateSet', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		setCatalogForTests(en);		
	});

	it('returns set-not-found when set is not in state', async () => {
		const state = buildState(app);
		const result = await renameTemplateSet(
			app,
			{ ...state, templateSets: [] },
			DEFAULT_SETTINGS,
			'fantasy',
			'fantasy-v2',
			async () => Promise.resolve([]),
			async () => Promise.resolve(true)
		);
		expect(result).toMatchObject({ ok: false, code: 'set-not-found' });
	});

	it('returns cancelled when live confirm returns null', async () => {
		const state = buildState(app);
		const result = await renameTemplateSet(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'fantasy-v2',
			async () => Promise.resolve(null),
			async () => Promise.resolve(true)
		);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
	});

	it('updates only selected worlds on live rename', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const result = await renameTemplateSet(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'fantasy-v2',
			async () => Promise.resolve(['WorldA']),
			async () => Promise.resolve(true)
		);
		
		expect(result).toMatchObject({
			ok: true,
			archived: false,
			worldsUpdated: 1,
			worldsLeftOnOldName: 1,
		});
		expect(vault.contentAt('WorldA/_index.md')).toContain('template_set: fantasy-v2');
		expect(vault.contentAt('WorldB/_index.md')).toContain('template_set: fantasy');
		expect(app.vault.getAbstractFileByPath('_system/templates/fantasy-v2')).toBeInstanceOf(
			TFolder
		);
	});

	it('archive path does not rewrite worlds', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const result = await renameTemplateSet(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'_fantasy',
			async () => Promise.resolve(['WorldA', 'WorldB']),
			async () => Promise.resolve(true)
		);

		expect(result).toMatchObject({
			ok: true,
			archived: true,
			worldsUpdated: 0,
			worldsLeftOnOldName: 2,
		});
		expect(vault.contentAt('WorldA/_index.md')).toContain('template_set: fantasy');
		expect(vault.contentAt('WorldB/_index.md')).toContain('template_set: fantasy');
	});

	it('returns cancelled when archive confirm is false', async () => {
		const state = buildState(app);
		const result = await renameTemplateSet(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'_fantasy',
			async () => Promise.resolve([]),
			async () => Promise.resolve(false)
		);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
	});

	it('returns new-exists when target folder exists', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		vault.seedFolder('_system/templates/fantasy-v2');

		const result = await renameTemplateSet(
			app,
			state,
			DEFAULT_SETTINGS,
			'fantasy',
			'fantasy-v2',
			async () => Promise.resolve(['WorldA']),
			async () => Promise.resolve(true)
		);
		expect(result).toMatchObject({ ok: false, code: 'new-exists' });
	});
});
