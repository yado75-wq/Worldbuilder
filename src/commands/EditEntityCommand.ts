import { App, Notice, TFile } from 'obsidian';
import { PluginState, FormResult } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import {
	buildEntityContent,
	buildFieldCandidates,
	DEFAULT_ENTITY_NOTES,
} from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { decomposeTimeframeValue } from '../time/TimeframeWidgetState';
import { extractPreservedSection } from '../util/PreservedSection';
import { buildFieldValues } from './shared/EntityPrefill';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';
import { createLinkedEntity } from './shared/CreateLinkedEntity';

export async function editEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	filePath: string
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

	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('File not found.');
		return;
	}

	const prefill = await buildFieldValues(app, file, fields);
	const { linkGroups, timeframeAnchors } = buildFieldCandidates(
		app, world, fields, templateSet, file.basename
	);
	const worldTimeUnit = getWorldTimeUnit(app, world);

	const { lookup } = buildTimeframeLookup(app, worldPath, templateSet);
	const timeframePointCandidates: Record<string, string[]> = {};
	for (const f of fields) {
		if (f.type !== 'timeframe') continue;
		timeframePointCandidates[f.key] = (timeframeAnchors[f.key] ?? [])
			.filter(name => decomposeTimeframeValue(lookup(name)).point);
	}

	const result = await new Promise<FormResult | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `Edit ${entityType}: ${file.basename}`,
			fields,
			prefill,
			linkCandidateGroups: linkGroups,
			timeframeCandidates: timeframeAnchors,
			worldTimeUnit,
			timeframePointCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
			onCreateLink: async (field, name) =>
				createLinkedEntity(
					app,
					state,
					world,
					templateSet,
					file.parent?.path ?? world.path,
					field,
					name
				),
		});
		modal.open();
	});

	if (!result) return;

	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice(`No title field defined for "${entityType}".`);
		return;
	}

	const rawTitle = result.data[titleField.key];
	const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
	if (!title) {
		new Notice('Name is required.');
		return;
	}

	const currentContent = await app.vault.read(file);
	const preservedSection = extractPreservedSection(currentContent, DEFAULT_ENTITY_NOTES);

	const timeframeResolutions = resolveTimeframeFieldsForDisplay(
		fields, result.data, lookup, worldTimeUnit, file.basename
	);
	const content = buildEntityContent(
		fields, result.data, entityType, title, preservedSection, timeframeResolutions
	);

	if (file.basename !== title) {
		const newPath = `${file.parent?.path ?? ''}/${title}.md`;
		if (app.vault.getAbstractFileByPath(newPath)) {
			new Notice(`Cannot rename: "${title}" already exists.`);
			return;
		}
		await app.fileManager.renameFile(file, newPath);
		const renamedFile = app.vault.getAbstractFileByPath(newPath);
		if (renamedFile instanceof TFile) {
			await app.vault.modify(renamedFile, content);
			await app.workspace.getLeaf(false).openFile(renamedFile);
		}
	} else {
		await app.vault.modify(file, content);
		await app.workspace.getLeaf(false).openFile(file);
	}

	new Notice(`${entityType} "${title}" updated.`);

	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
}