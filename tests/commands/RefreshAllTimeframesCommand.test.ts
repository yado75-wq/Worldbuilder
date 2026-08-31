import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,	
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { refreshAllTimeframes } from '../../src/commands/RefreshAllTimeframesCommand';
import { FieldDefinition } from '../../src/formkit';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';
import { PluginState } from '../../src/types/runtime';
import { PRESERVED_SECTION_MARKER } from '../../src/util/PreservedSection';
import { setCatalogForTests } from '../../src/i18n';
import en from '../../locales/en.json';
// ── Confirm stub ──────────────────────────────────────────────────────────

let confirmResult = false;

vi.mock('../../src/ui/ConfirmModal', () => ({
	ConfirmModal: class {
		onConfirm: (confirmed: boolean) => void;

		constructor(
			_app: unknown,
			_prompt: string,
			onConfirm: (confirmed: boolean) => void
		) {
			this.onConfirm = onConfirm;
		}

		open(): void {
			queueMicrotask(() => {
				this.onConfirm(confirmResult);
			});
		}
	},
}));

vi.mock('../../src/commands/RefreshDashboardCommand', () => ({
	refreshDashboard: vi.fn(async () => {}),
	worldDashboardPath: (worldPath: string) => `${worldPath}/_dashboard.md`,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────

const WORLD_PATH = 'TestWorld';
const MILESTONES = `${WORLD_PATH}/Milestones`;

const MILESTONE_FIELDS: FieldDefinition[] = [
	{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
	{ key: 'time', label: 'Time', type: 'timeframe', display: 'property', mandatory: true },
];

/** Stale body on purpose — not what buildEntityContent would emit today. */
function milestoneFile(name: string, timeRaw: string, preserved = 'USER NOTES'): string {
	return (
		`---\n` +
		`tags:\n` +
		`  - milestone\n` +
		`name: "${name}"\n` +
		`time: "${timeRaw}"\n` +
		`---\n\n` +
		`# ${name}\n\n` +
		`## Time\n` +
		`_STALE_\n\n` +
		`${PRESERVED_SECTION_MARKER}\n\n` +
		`${preserved}\n`
	);
}

function buildState(app: App, opts?: {
	templateSets?: TemplateSetInfo[];
	fields?: FieldDefinition[];
}): PluginState {
	const vault = app.vault as unknown as FakeVault;
	const fields = opts?.fields ?? MILESTONE_FIELDS;

	const templateSet: TemplateSetInfo = {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [{ entityType: 'Milestone', targetFolder: 'Milestones' }],
		worldTemplate: [],
		fieldSets: { Milestone: fields },
	};

	const templateSets = opts?.templateSets ?? [templateSet];

	const indexFile = asTFile(
		vault.seedFile(
			`${WORLD_PATH}/_index.md`,
			'---\ntags:\n  - world\nstatus: active\ntemplate_set: defaults\nname: "TestWorld"\n---\n\n# TestWorld\n'
		)
	);
	vault.seedFolder(MILESTONES);

	const worldFolder = asTFolder(app.vault.getAbstractFileByPath(WORLD_PATH)!);

	const world: WorldInfo = {
		name: 'TestWorld',
		path: WORLD_PATH,
		folder: worldFolder,
		indexFile,
		status: 'active',
		templateSet: 'defaults',		
		worldTemplate: [],
	};

	return {
		activeWorld: world,
		worlds: [world],
		templateSets,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('refreshAllTimeframes', () => {
	let app: App;

	beforeEach(() => {
		app = new App();
		resetFakeObsidian();
		confirmResult = false;
		setCatalogForTests(en);
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app);
		const result = await refreshAllTimeframes(app, state, 'Missing');
		expect(result).toEqual({ ok: false, code: 'world-not-found' });
	});

	it('exits when no template set is available', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'defaults';

		const result = await refreshAllTimeframes(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'no-template-sets' });
	});

	it('exits when no entities have a timeframe value', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		// Milestone tag but no time frontmatter → not a target
		vault.seedFile(
			`${MILESTONES}/Empty.md`,
			'---\ntags:\n  - milestone\nname: "Empty"\n---\n\n# Empty\n'
		);

		const result = await refreshAllTimeframes(app, state, WORLD_PATH);
		expect(result).toEqual({ ok: false, code: 'no-targets' });
	});

	// ── Confirm + write ──────────────────────────────────────────────────

	it('does not write when the user cancels the confirmation', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${MILESTONES}/Founding.md`;
		// Absolute-from-zero storage (triplet / number — accepted by parser)
		vault.seedFile(path, milestoneFile('Founding', '0'));
		confirmResult = false;

		const result = await refreshAllTimeframes(app, state, WORLD_PATH);
		expect(result).toEqual({ ok: false, code: 'cancelled' });
		expect(vault.contentAt(path)).toContain('_STALE_');
	});

	it('rewrites stale timeframe sections when confirmed', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${MILESTONES}/Founding.md`;
		vault.seedFile(path, milestoneFile('Founding', '0'));
		confirmResult = true;

		const result = await refreshAllTimeframes(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: true, refreshed: ['Founding'] });
		const content = vault.contentAt(path) ?? '';
		expect(content).not.toContain('_STALE_');
		expect(content).toContain(PRESERVED_SECTION_MARKER);
		expect(content).toContain('USER NOTES');
		expect(content).toContain('## Time');
	});

	it('skips entities whose field set has no title field', async () => {
		const vault = app.vault as unknown as FakeVault;
		const fieldsNoTitle: FieldDefinition[] = [
			{ key: 'time', label: 'Time', type: 'timeframe', display: 'property', mandatory: true },
		];
		const state = buildState(app, { fields: fieldsNoTitle });
		const path = `${MILESTONES}/Founding.md`;
		vault.seedFile(path, milestoneFile('Founding', '0'));
		confirmResult = true;

		const result = await refreshAllTimeframes(app, state, WORLD_PATH);
		expect(result).toMatchObject({ ok: false, code: 'already-up-to-date' });
		expect(vault.contentAt(path)).toContain('_STALE_');
	});
});