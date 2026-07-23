import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, TemplateSetInfo } from '../types';
import { PRESERVED_SECTION_MARKER, extractPreservedSection } from '../util/PreservedSection';
import { findMissingMandatoryFields } from './shared/EntityCompleteness';
import { findUnresolvedTimeframes, formatUnresolvedTimeframeEntry } from './shared/TimeframeResolutionReport';
import { formatMetaLabel } from './shared/MetaLabel';
import { buildDashboardContent, DEFAULT_DASHBOARD_NOTES, EntitySectionInput } from './shared/DashboardContentBuilder';
import { buildTimeframeLookup, getEntityFiles } from './shared/TimeframeLookupBuilder';

export async function refreshDashboard(
	app: App,
	state: PluginState,
	worldPath: string,
	openAfterRefresh = true
): Promise<void> {

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return;
	}

	const templateSet = findTemplateSet(state, world);
	if (!templateSet) {
		new Notice(`Template set "${world.templateSet}" not found.`);
		return;
	}

	// Read existing dashboard to preserve notes section
	const dashPath = `${worldPath}/_dashboard.md`;
	const existingDash = app.vault.getAbstractFileByPath(dashPath);
	let preservedSection = DEFAULT_DASHBOARD_NOTES;

	if (existingDash instanceof TFile) {
		const existingContent = await app.vault.read(existingDash);
		preservedSection = extractPreservedSection(existingContent, DEFAULT_DASHBOARD_NOTES);
	}

	// Read world meta from _index.md directly — cache may not be updated yet
	const indexContent = await app.vault.read(world.indexFile);

	// Parse frontmatter from raw content
	const frontmatterMatch = indexContent.match(/^---\n([\s\S]*?)\n---/);
	const frontmatterContent = frontmatterMatch?.[1] ?? '';
	const skipKeys = ['tags', 'status', 'name', 'template_set', 'position'];
	const metaEntries = frontmatterContent.length > 0
		? frontmatterContent
			.split('\n')
			.map(line => line.match(/^(\w+):\s*"?([^"]*)"?$/))
			.filter((m): m is RegExpMatchArray => m !== null && !skipKeys.includes(m[1] ?? ''))
			.filter(m => (m[2] ?? '').trim().length > 0)
			.map(m => ({ key: m[1] ?? '', label: formatMetaLabel(m[1] ?? ''), value: (m[2] ?? '').trim() }))
		: [];

	// TIME_DESIGN.md §4: time_unit defaults to "years" world-wide when a
	// world hasn't set one. Nothing is ever written to frontmatter for an
	// unset value (an unconfigured world stays zero-setup, §4/§1), so the
	// default is only ever shown here, never persisted.
	if (!metaEntries.some(m => m.key === 'time_unit')) {
		metaEntries.push({ key: 'time_unit', label: 'Time Unit', value: 'years _(default)_' });
	}

	const metaProps = metaEntries.map(m => `- **${m.label}:** ${m.value}`).join('\n');

	// Extract TODO section from _index.md body
	const todoMatch = indexContent.match(/## TODO\n([\s\S]*?)(?=\n## |$)/);
	const todoBlock = todoMatch?.[1]?.trim() ?? '_No TODO items yet._';

	// Discover sub-dashboards (files starting with _ except _index and _dashboard)
	const worldFolder = world.folder;
	const subDashboards = worldFolder.children
		.filter((f): f is TFile =>
			f instanceof TFile &&
			f.basename.startsWith('_') &&
			f.basename !== '_index' &&
			f.basename !== '_dashboard'
		)
		.map(f => `- [[${f.path}|${f.basename}]]`)
		.join('\n');

	// Build entity sections from folder rules
	const entitySections: EntitySectionInput[] = templateSet.folderRules
		.filter(rule => rule.targetFolder !== '*')
		.map(rule => {
			const folderPath = `${worldPath}/${rule.targetFolder}`;
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof Object) || !('children' in folder)) {
				return { targetFolder: rule.targetFolder, count: 0, list: '_No entries yet._' };
			}

			const entities = getEntityFiles(app, worldPath, rule.targetFolder);

			const count = entities.length;
			const list = count > 0
				? entities.map(f => `- [[${f.path}|${f.basename}]]`).join('\n')
				: '_No entries yet._';

			return { targetFolder: rule.targetFolder, count, list };
		});

	// Find entities missing mandatory fields, for the Needs attention section
	const needsAttention = await buildNeedsAttentionSection(app, worldPath, templateSet);

	// Assemble dashboard content
	const content = buildDashboardContent(
		{
			worldName: world.name,
			refreshedAt: new Date().toLocaleString(),
			metaProps,
			todoBlock,
			needsAttention,
			subDashboards,
			entitySections,
			preservedSection,
		},
		PRESERVED_SECTION_MARKER
	);

	// Write or update dashboard file
	if (existingDash instanceof TFile) {
		await app.vault.modify(existingDash, content);
	} else {
		await app.vault.create(dashPath, content);
	}

	// Open the dashboard — skipped for silent auto-refreshes (e.g. after
	// editing an entity), so it doesn't steal focus from what's on screen
	if (openAfterRefresh) {
		const dashFile = app.vault.getAbstractFileByPath(dashPath);
		if (dashFile instanceof TFile) {
			await app.workspace.getLeaf(false).openFile(dashFile);
		}
	}

	new Notice(`Dashboard refreshed for "${world.name}".`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTemplateSet(state: PluginState, world: WorldInfo): TemplateSetInfo | null {
	return state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0]
		?? null;
}

async function buildNeedsAttentionSection(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): Promise<string> {
	const incomplete: string[] = [];

	// Check 1: presence (TIME_DESIGN.md §1, §6) — is a mandatory field there
	// at all. Unaffected by the resolution check below; a mandatory
	// `timeframe` field with its key entirely absent is still reported here,
	// via findMissingMandatoryFields's own `type === 'timeframe'` branch.
	for (const rule of templateSet.folderRules) {
		if (rule.targetFolder === '*') continue;

		const fields = templateSet.fieldSets[rule.entityType];
		if (!fields || fields.length === 0) continue;

		const mandatoryFields = fields.filter(f => f.mandatory && f.display !== 'title');
		if (mandatoryFields.length === 0) continue;

		// Only read file content (needed for section-type fields) when this
		// entity type actually has a mandatory section field to check
		const needsContent = mandatoryFields.some(f => f.display === 'section');

		const entities = getEntityFiles(app, worldPath, rule.targetFolder);

		for (const entity of entities) {
			const frontmatter = app.metadataCache.getFileCache(entity)?.frontmatter;
			const generatedContent = needsContent
				? (await app.vault.read(entity)).split(PRESERVED_SECTION_MARKER)[0] ?? ''
				: '';

			const missing = findMissingMandatoryFields(mandatoryFields, frontmatter, generatedContent);
			if (missing.length > 0) {
				incomplete.push(`- [[${entity.path}|${entity.basename}]] — missing: ${missing.join(', ')}`);
			}
		}
	}

	// Check 2: resolution (TIME_DESIGN.md §6) — does a *present* timeframe
	// value actually resolve. Distinct from check 1 above: a field can be
	// fully present and still fail here (e.g. it anchors to a Milestone that
	// itself has no timepoint). Runs across the whole template set, since an
	// anchor chain can cross entity-type/folder boundaries, and reports
	// failures with root causes sorted before their dependents (§6, §11).
	const { lookup, targets } = buildTimeframeLookup(app, worldPath, templateSet);
	const unresolved = findUnresolvedTimeframes(targets, lookup);
	for (const entry of unresolved) {
		incomplete.push(formatUnresolvedTimeframeEntry(entry));
	}

	return incomplete.length > 0 ? incomplete.join('\n') : '_Nothing outstanding._';
}
