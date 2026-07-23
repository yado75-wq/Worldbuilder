import { App, Notice, TFile } from 'obsidian';
import { PluginState } from '../types';
import { ConfirmModal } from '../ui/ConfirmModal';
import { buildEntityContent, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';
import { buildTimeframeLookup, getWorldTimeUnit } from './shared/TimeframeLookupBuilder';
import { resolveTimeframeFieldsForDisplay } from './shared/TimeframeDisplay';
import { buildFieldValues } from './shared/EntityPrefill';
import { extractPreservedSection } from '../util/PreservedSection';
import { refreshDashboard } from './RefreshDashboardCommand';

interface RefreshCandidate {
	file: TFile;
	basename: string;
	newContent: string;
}

/**
 * Regenerates every entity in the world whose own `timeframe` value is
 * present, recomputing its "Resolved:" line (§8) against the *current*
 * state of everything it anchors to.
 *
 * Why this exists: `CreateEntityCommand.ts`/`EditEntityCommand.ts` only
 * compute an entity's `Resolved:` line at the moment *that* entity is
 * created or edited. If A anchors to B and B's own timeframe later
 * changes, A's `Resolved:` line goes stale — it isn't touched again until
 * A itself is re-edited. This is the vault-wide catch-up pass for that;
 * it's a separate, explicit command (not folded into `refreshDashboard`,
 * which is scoped to one file, or `syncWorldFiles`, which is about folder
 * placement, not content) precisely because it rewrites every
 * timeframe-bearing entity at once — real scope, deserving its own
 * confirmation, not a side effect of something people already run often.
 *
 * Only entities whose regenerated content actually differs from what's on
 * disk are written — an entity whose `Resolved:` line was already correct
 * is left untouched.
 */
export async function refreshAllTimeframes(
	app: App,
	state: PluginState,
	worldPath: string
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

	const { lookup, targets } = buildTimeframeLookup(app, worldPath, templateSet);
	if (targets.length === 0) {
		new Notice('No entities with a timeframe value found.');
		return;
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
		return;
	}

	const preview = candidates.map(c => `• ${c.basename}`).join('\n');
	const confirmed = await askConfirm(
		app,
		`Refresh ${candidates.length} entit${candidates.length === 1 ? 'y' : 'ies'}' resolved timeframes?\n\n${preview}`,
		'Refresh',
		'Cancel'
	);

	if (!confirmed) return;

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

	// Refresh dashboard if it exists — Needs Attention may have changed
	// now that some entities' resolved values are current again.
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
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
