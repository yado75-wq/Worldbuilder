import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import {
	FakeVault,
	FakeNoticeLog,
	resetFakeObsidian,
	asTFile,
	asTFolder,
} from '../fakes/obsidian';
import { refreshAllTimeframes } from '../../src/commands/RefreshAllTimeframesCommand';
import { PluginState, TemplateSetInfo, WorldInfo, FieldDefinition } from '../../src/types';
import { PRESERVED_SECTION_MARKER } from '../../src/util/PreservedSection';

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
		folderRules: templateSet.folderRules,
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
	});

	// ── Guards ────────────────────────────────────────────────────────────

	it('exits when world is not found', async () => {
		const state = buildState(app);

		await refreshAllTimeframes(app, state, 'Missing');

		expect(FakeNoticeLog.some(m => m.includes('World not found'))).toBe(true);
	});

	it('exits when no template set is available', async () => {
		const state = buildState(app, { templateSets: [] });
		state.worlds[0]!.templateSet = 'defaults';

		await refreshAllTimeframes(app, state, WORLD_PATH);

		expect(FakeNoticeLog.some(m => m.includes('No template sets found. Restore or create one under the templates folder (or reload the plugin).'))).toBe(true);
	});

	it('exits when no entities have a timeframe value', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		// Milestone tag but no time frontmatter → not a target
		vault.seedFile(
			`${MILESTONES}/Empty.md`,
			'---\ntags:\n  - milestone\nname: "Empty"\n---\n\n# Empty\n'
		);

		await refreshAllTimeframes(app, state, WORLD_PATH);

		expect(FakeNoticeLog.some(m => m.includes('No entities with a timeframe value found'))).toBe(true);
	});

	// ── Confirm + write ──────────────────────────────────────────────────

	it('does not write when the user cancels the confirmation', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${MILESTONES}/Founding.md`;
		// Absolute-from-zero storage (triplet / number — accepted by parser)
		vault.seedFile(path, milestoneFile('Founding', '0'));
		confirmResult = false;

		await refreshAllTimeframes(app, state, WORLD_PATH);

		expect(vault.contentAt(path)).toContain('_STALE_');
		expect(FakeNoticeLog.some(m => m.includes('Refreshed'))).toBe(false);
	});

	it('rewrites stale timeframe sections when confirmed', async () => {
		const vault = app.vault as unknown as FakeVault;
		const state = buildState(app);
		const path = `${MILESTONES}/Founding.md`;
		vault.seedFile(path, milestoneFile('Founding', '0'));
		confirmResult = true;

		await refreshAllTimeframes(app, state, WORLD_PATH);

		const content = vault.contentAt(path) ?? '';
		expect(content).not.toContain('_STALE_');
		expect(content).toContain(PRESERVED_SECTION_MARKER);
		expect(content).toContain('USER NOTES');
		expect(content).toContain('## Time');
		expect(FakeNoticeLog.some(m => m.includes('Refreshed') && m.includes('Founding'))).toBe(true);
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

		await refreshAllTimeframes(app, state, WORLD_PATH);

		// Target exists but is skipped → no candidates → up to date + skipped
		expect(FakeNoticeLog.some(m =>
			m.includes('already up to date') || m.includes('Skipped')
		)).toBe(true);
		expect(vault.contentAt(path)).toContain('_STALE_');
	});
});