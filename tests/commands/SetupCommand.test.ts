import { beforeEach, describe, expect, it } from 'vitest';
import { App, TFolder } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
} from '../fakes/obsidian';
import {
	ensureDefaultTemplates,
	cloneTemplateSet,
	resetTemplateSet,
} from '../../src/commands/SetupCommand';
import { DEFAULT_SETTINGS, TemplateSetInfo } from '../../src/types';

const PLUGIN_DIR = 'plugin-root';
const DEFAULTS_DIR = `${PLUGIN_DIR}/defaults`;

const DEFAULT_FILES = [
	'world-template.md',
	'folder-rules.md',
	'WorldMeta_Fields.md',
	'Generic_Fields.md',
	'Character_Fields.md',
	'Location_Fields.md',
	'Faction_Fields.md',
];

function seedPluginDefaults(vault: FakeVault, contents?: Record<string, string>): void {
	for (const filename of DEFAULT_FILES) {
		const body = contents?.[filename] ?? `# default ${filename}\n`;
		vault.adapter.seedExternal(`${DEFAULTS_DIR}/${filename}`, body);
	}
}

function defaultsTemplateSet(): TemplateSetInfo {
	return {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [],
		worldTemplate: [],
		fieldSets: {},
	};
}

describe('SetupCommand', () => {
	let app: App;
	let vault: FakeVault;

	beforeEach(() => {
		app = new App();
		vault = app.vault as unknown as FakeVault;
		resetFakeObsidian();
		seedPluginDefaults(vault);
	});

	// ── ensureDefaultTemplates ────────────────────────────────────────────

	describe('ensureDefaultTemplates', () => {
		it('creates defaults folder and copies missing default files', async () => {
			const name = await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, []);

			expect(name).toBe('defaults');
			expect(app.vault.getAbstractFileByPath('_system/templates/defaults')).toBeInstanceOf(TFolder);

			for (const filename of DEFAULT_FILES) {
				const path = `_system/templates/defaults/${filename}`;
				expect(app.vault.getAbstractFileByPath(path)).not.toBeNull();
				expect(vault.contentAt(path)).toContain(filename);
			}
		});

		it('does not overwrite an existing defaults file', async () => {
			vault.seedFile(
				'_system/templates/defaults/Character_Fields.md',
				'USER CUSTOM\n'
			);

			await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, []);

			expect(vault.contentAt('_system/templates/defaults/Character_Fields.md')).toBe('USER CUSTOM\n');
		});

		it('returns another existing set name when present', async () => {
			const existing: TemplateSetInfo[] = [
				defaultsTemplateSet(),
				{ ...defaultsTemplateSet(), name: 'fantasy', path: '_system/templates/fantasy' },
			];

			const name = await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, existing);

			expect(name).toBe('fantasy');
		});

		it('warns when a default source file cannot be read', async () => {
			// Only seed some files — leave one missing on the adapter
			const vault2 = (app = new App()).vault as unknown as FakeVault;
			for (const filename of DEFAULT_FILES.slice(0, -1)) {
				vault2.adapter.seedExternal(`${DEFAULTS_DIR}/${filename}`, 'ok\n');
			}

			await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, []);

			expect(FakeNoticeLog.some(m => m.includes('could not copy default file'))).toBe(true);
		});
	});

	// ── cloneTemplateSet ──────────────────────────────────────────────────

	describe('cloneTemplateSet', () => {
		beforeEach(async () => {
			await ensureDefaultTemplates(app, DEFAULT_SETTINGS, PLUGIN_DIR, []);
		});

		it('returns false when the source set is missing', async () => {
			const ok = await cloneTemplateSet(app, DEFAULT_SETTINGS, 'nope', 'copy');

			expect(ok).toBe(false);
			expect(FakeNoticeLog.some(m => m.includes('not found'))).toBe(true);
		});

		it('returns false when the target set already exists', async () => {
			await cloneTemplateSet(app, DEFAULT_SETTINGS, 'defaults', 'fantasy');
			const ok = await cloneTemplateSet(app, DEFAULT_SETTINGS, 'defaults', 'fantasy');

			expect(ok).toBe(false);
			expect(FakeNoticeLog.some(m => m.includes('already exists'))).toBe(true);
		});

		it('copies files into the new template set', async () => {
			const ok = await cloneTemplateSet(app, DEFAULT_SETTINGS, 'defaults', 'fantasy');

			expect(ok).toBe(true);
			expect(app.vault.getAbstractFileByPath('_system/templates/fantasy')).toBeInstanceOf(TFolder);
			expect(
				app.vault.getAbstractFileByPath('_system/templates/fantasy/Character_Fields.md')
			).not.toBeNull();
			expect(FakeNoticeLog.some(m => m.includes('created from'))).toBe(true);
		});
	});

	// ── resetTemplateSet ──────────────────────────────────────────────────

	describe('resetTemplateSet', () => {
		it('overwrites an existing file with plugin defaults', async () => {
			vault.seedFile(
				'_system/templates/defaults/Character_Fields.md',
				'STALE CUSTOM\n'
			);
			seedPluginDefaults(vault, {
				'Character_Fields.md': 'FRESH DEFAULT\n',
			});

			await resetTemplateSet(app, DEFAULT_SETTINGS, PLUGIN_DIR, 'defaults');

			expect(vault.contentAt('_system/templates/defaults/Character_Fields.md')).toContain('FRESH DEFAULT');
			expect(FakeNoticeLog.some(m => m.includes('reset to plugin defaults'))).toBe(true);
		});

		it('creates missing files in the set folder', async () => {
			await resetTemplateSet(app, DEFAULT_SETTINGS, PLUGIN_DIR, 'defaults');

			for (const filename of DEFAULT_FILES) {
				expect(
					app.vault.getAbstractFileByPath(`_system/templates/defaults/${filename}`)
				).not.toBeNull();
			}
		});
	});
});