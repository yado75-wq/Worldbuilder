import { App, Notice, TFile } from 'obsidian';
import { PluginState } from '../types/runtime';
import { ConfirmModal } from '../ui/ConfirmModal';
import { buildEntityContent, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { buildFieldValues } from './shared/EntityPrefill';
import { extractPreservedSection } from '../util/PreservedSection';
import { refreshDashboard } from './RefreshDashboardCommand';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';

interface RefreshCandidate {
	file: TFile;
	basename: string;
	newContent: string;
}

export type RefreshAllTimeframesResult =
	| { ok: true; refreshed: string[]; failed: string[]; skipped: number }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'no-targets'
				| 'already-up-to-date'
				| 'cancelled';
			detail?: string;
	  };

function err(
	code: Extract<RefreshAllTimeframesResult, { ok: false }>['code'],
	detail?: string
): RefreshAllTimeframesResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function refreshAllTimeframes(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<RefreshAllTimeframesResult> {
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

	const { lookup, targets } = buildTimeframeLookup(app, worldPath, templateSet);
	if (targets.length === 0) {
		new Notice('No entities with a timeframe value found.');
		return err('no-targets');
	}

	const worldTimeUnit = getWorldTimeUnit(app, world);
	const candidates: RefreshCandidate[] = [];
	const skipped: string[] = [];

	for (const target of targets) {
		const file = app.vault.getAbstractFileByPath(target.path);
		if (!(file instanceof TFile)) {
			skipped.push(target.basename);
			continue;
		}

		const fields = templateSet.fieldSets[target.entityType];
		const titleField = fields?.find(f => f.display === 'title');
		if (!fields || fields.length === 0 || !titleField) {
			skipped.push(target.basename);
			continue;
		}

		const data = await buildFieldValues(app, file, fields);
		const title = data[titleField.key]?.trim() || file.basename;

		const currentContent = await app.vault.read(file);
		const preservedSection = extractPreservedSection(currentContent, DEFAULT_ENTITY_NOTES);

		const timeframeResolutions = resolveTimeframeFieldsForDisplay(
			fields, data, lookup, worldTimeUnit, file.basename
		);
		const newContent = buildEntityContent(
			fields, data, target.entityType, title, preservedSection, timeframeResolutions
		);

		if (newContent !== currentContent) {
			candidates.push({ file, basename: file.basename, newContent });
		}
	}

	if (candidates.length === 0) {
		const msg = skipped.length > 0
			? `All resolved timeframes are already up to date. ${skipped.length} entities skipped (missing type or title field).`
			: 'All resolved timeframes are already up to date.';
		new Notice(msg);
		return err('already-up-to-date', skipped.length > 0 ? String(skipped.length) : undefined);
	}

	const preview = candidates.map(c => `• ${c.basename}`).join('\n');
	const confirmed = await askConfirm(
		app,
		`Refresh ${candidates.length} entit${candidates.length === 1 ? 'y' : 'ies'}' resolved timeframes?\n\n${preview}`,
		'Refresh',
		'Cancel'
	);

	if (!confirmed) {
		return err('cancelled');
	}

	const refreshed: string[] = [];
	const failed: string[] = [];

	for (const candidate of candidates) {
		try {
			await app.vault.modify(candidate.file, candidate.newContent);
			refreshed.push(candidate.basename);
		} catch {
			failed.push(candidate.basename);
		}
	}

	const parts: string[] = [];
	if (refreshed.length > 0) parts.push(`Refreshed: ${refreshed.join(', ')}`);
	if (failed.length > 0) parts.push(`Failed: ${failed.join(', ')}`);
	if (skipped.length > 0) parts.push(`Skipped: ${skipped.length}`);
	new Notice(parts.join('\n'));

	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}

	return { ok: true, refreshed, failed, skipped: skipped.length };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function askConfirm(
	app: App,
	message: string,
	confirmLabel: string,
	cancelLabel: string
): Promise<boolean> {
	return new Promise((resolve) => {
		const modal = new ConfirmModal(app, message, resolve, confirmLabel, cancelLabel, 'Refresh all timeframes');
		modal.open();
	});
}
