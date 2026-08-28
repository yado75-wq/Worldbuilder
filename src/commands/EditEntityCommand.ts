import { App, Notice, TFile } from 'obsidian';
import { decomposeTimeframeValue, EntityFormModal, FormResult } from '../formkit';
import { PluginState } from '../types/runtime';
import { refreshDashboard, worldDashboardPath } from './RefreshDashboardCommand';
import {
	buildEntityContent,
	buildFieldCandidates,
	DEFAULT_ENTITY_NOTES,
} from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';

import { extractPreservedSection } from '../util/PreservedSection';
import { buildFieldValues } from './shared/EntityPrefill';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';
import { createLinkedEntity } from './shared/CreateLinkedEntity';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import {
	resolveTemplateSetByName,
	missingTemplateSetMessage,
} from '../context/TemplateSetResolve';

export type EditEntityResult =
	| { ok: true; path: string }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'type-not-usable'
				| 'no-fields'
				| 'file-not-found'
				| 'cancelled'
				| 'no-title-field'
				| 'name-required'
				| 'rename-conflict';
			detail?: string;
	  };

function err(
	code: Extract<EditEntityResult, { ok: false }>['code'],
	detail?: string
): EditEntityResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function editEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	filePath: string
): Promise<EditEntityResult> {
	if (hasActiveWorldConflict(state)) {
		new Notice(
			'Active world conflict: open worldbuilder settings and use set as active (exactly one world must be active).'
		);
		return err('active-world-conflict');
	}

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return err('world-not-found');
	}

	const resolved = resolveTemplateSetByName(state.templateSets, world.templateSet);
	if (!resolved.ok) {
		new Notice(missingTemplateSetMessage(resolved));
		return err(
			resolved.reason === 'none' ? 'no-template-sets' : 'missing-template-set',
			resolved.reason === 'missing' ? resolved.requested : undefined
		);
	}
	const templateSet = resolved.set;

	if (!isEntityTypeUsable(templateSet, entityType)) {
		new Notice(`No usable fields defined for "${entityType}".`);
		return err('type-not-usable', entityType);
	}

	const fields = templateSet.fieldSets[entityType];
	if (!fields || fields.length === 0) {
		new Notice(`No fields defined for "${entityType}".`);
		return err('no-fields', entityType);
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('File not found.');
		return err('file-not-found', filePath);
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

	const formResult = await new Promise<FormResult | null>((resolve) => {
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
			onCreateLink: async (field, name) => {
					const result = await createLinkedEntity(
						app,
						state,
						world,
						templateSet,
						file.parent?.path ?? world.path,
						field,
						name
					);
					return result.ok ? result.link : null;
				},
		});
		modal.open();
	});

	if (!formResult) {
		return err('cancelled');
	}

	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice(`No title field defined for "${entityType}".`);
		return err('no-title-field', entityType);
	}

	const rawTitle = formResult.data[titleField.key];
	const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
	if (!title) {
		new Notice('Name is required.');
		return err('name-required');
	}

	const currentContent = await app.vault.read(file);
	const preservedSection = extractPreservedSection(currentContent, DEFAULT_ENTITY_NOTES);

	const timeframeResolutions = resolveTimeframeFieldsForDisplay(
		fields, formResult.data, lookup, worldTimeUnit, file.basename
	);
	const content = buildEntityContent(
		fields, formResult.data, entityType, title, preservedSection, timeframeResolutions
	);

	let finalPath = file.path;

	if (file.basename !== title) {
		const newPath = `${file.parent?.path ?? ''}/${title}.md`;
		if (app.vault.getAbstractFileByPath(newPath)) {
			new Notice(`Cannot rename: "${title}" already exists.`);
			return err('rename-conflict', newPath);
		}
		await app.fileManager.renameFile(file, newPath);
		const renamedFile = app.vault.getAbstractFileByPath(newPath);
		if (renamedFile instanceof TFile) {
			await app.vault.modify(renamedFile, content);
			await app.workspace.getLeaf(false).openFile(renamedFile);
			finalPath = newPath;
		}
	} else {
		await app.vault.modify(file, content);
		await app.workspace.getLeaf(false).openFile(file);
	}

	new Notice(`${entityType} "${title}" updated.`);
	
	const dashPath = worldDashboardPath(worldPath);
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}

	return { ok: true, path: finalPath };
}