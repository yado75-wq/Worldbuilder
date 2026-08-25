import { App, Notice, TFile } from 'obsidian';
import { FormResult } from '../types/fields';
import { PluginState } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { buildEntityContent, buildFieldCandidates, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { decomposeTimeframeValue } from '../time/TimeframeWidgetState';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';
import { refreshDashboard } from './RefreshDashboardCommand';
import { createLinkedEntity } from './shared/CreateLinkedEntity';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';

export type CreateEntityResult =
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
				| 'cancelled'
				| 'no-title-field'
				| 'name-required'
				| 'already-exists';
			detail?: string;
	  };

function err(
	code: Extract<CreateEntityResult, { ok: false }>['code'],
	detail?: string
): CreateEntityResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function createEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	folderPath: string
): Promise<CreateEntityResult> {
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

	const formResult = await new Promise<FormResult | null>((resolve) => {
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
			onCreateLink: async (field, name) => {
				const result = await createLinkedEntity(
					app,
					state,
					world,
					templateSet,
					folderPath, // CreateEntity: folderPath; EditEntity: file.parent?.path ?? world.path
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

	const targetPath = `${folderPath}/${title}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${title}" already exists in ${folderPath}.`);
		return err('already-exists', targetPath);
	}

	const timeframeResolutions = resolveTimeframeFieldsForDisplay(
		fields, formResult.data, lookup, worldTimeUnit, title
	);
	const content = buildEntityContent(
		fields, formResult.data, entityType, title, DEFAULT_ENTITY_NOTES, timeframeResolutions
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

	return { ok: true, path: targetPath };
}