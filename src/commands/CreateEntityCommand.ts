import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition, TemplateSetInfo } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { buildEntityContent, buildLinkCandidates, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { decomposeTimeframeValue } from '../time/TimeframeWidgetState';

import { refreshDashboard } from './RefreshDashboardCommand';

export async function createEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	folderPath: string
): Promise<void> {

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return;
	}

	const templateSet = state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0];

	if (!templateSet) {
		new Notice('No template set found.');
		return;
	}

	const fields = templateSet.fieldSets[entityType];
	if (!fields || fields.length === 0) {
		new Notice(`No fields defined for "${entityType}".`);
		return;
	}

	const linkCandidates = buildLinkCandidates(app, world, fields, templateSet);
	const worldTimeUnit = getWorldTimeUnit(app, world);

	// A candidate anchor whose own stored value is a point (start === end,
	// §3) doesn't need separate `:start`/`:end` options in the widget —
	// they'd always resolve identically. Determined the same way
	// TimeframeWidgetState.ts itself treats "point" (a widget-level
	// convenience, not strict resolved equality, §3) rather than a second,
	// slightly-different definition.
	const { lookup } = buildTimeframeLookup(app, worldPath, templateSet);
	const timeframePointCandidates: Record<string, string[]> = {};
	for (const f of fields) {
		if (f.type !== 'timeframe') continue;
		timeframePointCandidates[f.key] = (linkCandidates[f.key] ?? [])
			.filter(name => decomposeTimeframeValue(lookup(name)).point);
	}

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `New ${entityType}`,
			fields,
			prefill: {},
			linkCandidates,
			worldTimeUnit,
			timeframePointCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
			onCreateLink: async (field, name) => createLinkedEntity(app, state, world, templateSet, folderPath, field, name),
		});
		modal.open();
	});

	if (!result) return;

	// Get title field value for filename
	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice(`No title field defined for "${entityType}".`);
		return;
	}

	const title = result.data[titleField.key]?.trim();
	if (!title) {
		new Notice('Name is required.');
		return;
	}

	// Check for duplicate
	const targetPath = `${folderPath}/${title}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${title}" already exists in ${folderPath}.`);
		return;
	}

	// Build file content. Resolved values (§8's "Resolved:" line) are
	// computed against the whole template set's current data — an anchor
	// this entity points at may already exist even though this entity
	// itself doesn't yet, so the lookup doesn't need this file to be on
	// disk first. `title` is this entity's real ref even before it's
	// written — no other entity in the vault can be using it yet, since
	// the duplicate-path check above already ruled that out. Reuses the
	// `lookup` built earlier (for timeframePointCandidates) rather than
	// re-scanning the vault.
	const timeframeResolutions = resolveTimeframeFieldsForDisplay(fields, result.data, lookup, worldTimeUnit, title);
	const content = buildEntityContent(fields, result.data, entityType, title, DEFAULT_ENTITY_NOTES, timeframeResolutions);

	await app.vault.create(targetPath, content);

	// Open the new file
	const newFile = app.vault.getAbstractFileByPath(targetPath);
	if (newFile instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(newFile);
	}

	new Notice(`${entityType} "${title}" created.`);

	// Refresh dashboard if it exists
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createLinkedEntity(
	app: App,
	state: PluginState,
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	folderPath: string,
	field: FieldDefinition,
	name: string
): Promise<string | null> {
	const linkedFolderName = field.linkFolder?.trim();
	if (!linkedFolderName) return null;

	const trimmedName = name.trim();
	if (!trimmedName) return null;

	// Find entity type from folder rule (e.g. "Factions" → "Faction")
	const rule = templateSet.folderRules.find(r => r.targetFolder === linkedFolderName);
	const entityType = rule?.entityType ?? linkedFolderName;

	const linkedFields = templateSet.fieldSets[entityType];
	const targetFolder = resolveLinkedTargetFolder(world, templateSet, linkedFolderName, folderPath);
	await ensureFolder(app, targetFolder);

	const targetPath = `${targetFolder}/${trimmedName}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${trimmedName}" already exists in ${targetFolder}.`);
		return null;
	}

	const content = linkedFields && linkedFields.length > 0
		? buildEntityContent(linkedFields, {}, entityType, trimmedName, DEFAULT_ENTITY_NOTES)
		: buildMinimalEntityContent(entityType, trimmedName, DEFAULT_ENTITY_NOTES);

	await app.vault.create(targetPath, content);
	new Notice(`${entityType} "${trimmedName}" created.`);

	const dashPath = `${world.path}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, world.path, false);
	}

	return `[[${trimmedName}]]`;
}

function resolveLinkedTargetFolder(
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	linkedFolderName: string,
	fallbackFolderPath: string
): string {
	// linkedFolderName is the folder name (e.g. "Factions")
	// match against targetFolder in rules
	const rule = templateSet.folderRules.find(
		r => r.targetFolder === linkedFolderName
	);
	if (rule?.targetFolder && rule.targetFolder !== '*') {
		return `${world.path}/${rule.targetFolder}`;
	}
	return fallbackFolderPath;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) return;
	await app.vault.createFolder(path);
}
