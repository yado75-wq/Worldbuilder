import { App, Notice, TFile } from 'obsidian';
import { PluginState } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import {
	buildEntityContent,
	buildFieldCandidates,
	DEFAULT_ENTITY_NOTES,
} from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { decomposeTimeframeValue } from '../time/TimeframeWidgetState';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';
import { refreshDashboard } from './RefreshDashboardCommand';
import { createLinkedEntity } from './shared/CreateLinkedEntity';

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

	if (!isEntityTypeUsable(templateSet, entityType)) {
		new Notice(`No usable fields defined for "${entityType}".`);
		return;
	}

	const fields = templateSet.fieldSets[entityType];
	if (!fields || fields.length === 0) {
		new Notice(`No fields defined for "${entityType}".`);
		return;
	}

	const { linkGroups, timeframeAnchors } = buildFieldCandidates(
		app, world, fields, templateSet
	);
	const worldTimeUnit = getWorldTimeUnit(app, world);

	const { lookup } = buildTimeframeLookup(app, worldPath, templateSet);
	const timeframePointCandidates: Record<string, string[]> = {};
	for (const f of fields) {
		if (f.type !== 'timeframe') continue;
		timeframePointCandidates[f.key] = (timeframeAnchors[f.key] ?? [])
			.filter(name => decomposeTimeframeValue(lookup(name)).point);
	}

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `New ${entityType}`,
			fields,
			prefill: {},
			linkCandidateGroups: linkGroups,
			timeframeCandidates: timeframeAnchors,
			worldTimeUnit,
			timeframePointCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
			onCreateLink: async (field, name) =>
				createLinkedEntity(app, state, world, templateSet, folderPath, field, name),
		});
		modal.open();
	});

	if (!result) return;

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

	const targetPath = `${folderPath}/${title}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${title}" already exists in ${folderPath}.`);
		return;
	}

	const timeframeResolutions = resolveTimeframeFieldsForDisplay(
		fields, result.data, lookup, worldTimeUnit, title
	);
	const content = buildEntityContent(
		fields, result.data, entityType, title, DEFAULT_ENTITY_NOTES, timeframeResolutions
	);

	await app.vault.create(targetPath, content);

	const newFile = app.vault.getAbstractFileByPath(targetPath);
	if (newFile instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(newFile);
	}

	new Notice(`${entityType} "${title}" created.`);

	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
}