import { App, Notice, TFile } from 'obsidian';
import { PluginState } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import { buildEntityContent, buildLinkCandidates, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { decomposeTimeframeValue } from '../time/TimeframeWidgetState';
import { extractPreservedSection } from '../util/PreservedSection';
import { buildFieldValues } from './shared/EntityPrefill';

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

	// Build prefill from existing file
	const prefill = await buildFieldValues(app, file, fields);
	const linkCandidates = buildLinkCandidates(app, world, fields, templateSet, file.basename);
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
			title: `Edit ${entityType}: ${file.basename}`,
			fields,
			prefill,
			linkCandidates,
			worldTimeUnit,
			timeframePointCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
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

	// Read fresh content right before rebuilding, in case the file changed
	// externally while the edit modal was open
	const currentContent = await app.vault.read(file);
	const preservedSection = extractPreservedSection(currentContent, DEFAULT_ENTITY_NOTES);

	// Build updated content. As in CreateEntityCommand.ts, resolved values
	// are computed against the whole template set's current vault state —
	// this reads the fresh raw value for every entity except this one
	// (still the pre-edit content on disk until we write below), which is
	// why this entity's own about-to-be-saved value is threaded through
	// resolveTimeframeFieldsForDisplay separately rather than relying on
	// the lookup alone. `file.basename` (not `title`, which may be a
	// pending rename) is used as `selfRef` — it's this entity's identity
	// as it currently exists in the vault, matching both the lookup map's
	// keys and whatever ref other entities' existing anchors still point
	// at, so a cycle routed through this entity is actually caught. Reuses
	// the `lookup` built earlier (for timeframePointCandidates) rather
	// than re-scanning the vault — the small tradeoff is that it reflects
	// vault state as of just before the modal opened, not just after it
	// closed; negligible for a blocking modal dialog.
	const timeframeResolutions = resolveTimeframeFieldsForDisplay(
		fields, result.data, lookup, worldTimeUnit, file.basename
	);
	const content = buildEntityContent(fields, result.data, entityType, title, preservedSection, timeframeResolutions);

	// Handle rename if name changed
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

	// Refresh dashboard if it exists
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
}
