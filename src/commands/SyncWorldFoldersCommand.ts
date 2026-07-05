import { App, Notice, TFolder } from 'obsidian';
import { PluginState, WorldInfo, TemplateSetInfo } from '../types';

export async function syncWorldFolders(
	app: App,
	state: PluginState,
	worldPath: string
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

	const created: string[] = [];
	const skipped: string[] = [];
	const deleted: string[] = [];

	const worldFolder = app.vault.getAbstractFileByPath(worldPath);
	if (!(worldFolder instanceof TFolder)) {
		new Notice('World folder not found.');
		return;
	}

	// Create missing folders
	for (const sub of templateSet.worldTemplate) {
		const folderPath = `${worldPath}/${sub}`;
		if (app.vault.getAbstractFileByPath(folderPath)) {
			skipped.push(sub);
		} else {
			await app.vault.createFolder(folderPath);
			created.push(sub);
		}
	}

	// Remove empty folders not in template
	// Only check direct children of the world root
	for (const child of worldFolder.children) {
		if (!(child instanceof TFolder)) continue;

		// Skip folders that are in the template
		if (templateSet.worldTemplate.includes(child.name)) continue;

		// Skip non-empty folders
		if (child.children.length > 0) continue;

		await app.vault.delete(child);
		deleted.push(child.name);
	}

	// Build summary notice
	const parts: string[] = [];
	if (created.length > 0) parts.push(`Created: ${created.join(', ')}`);
	if (deleted.length > 0) parts.push(`Removed empty: ${deleted.join(', ')}`);
	if (skipped.length > 0) parts.push(`Kept: ${skipped.join(', ')}`);
	if (parts.length === 0) parts.push('No changes needed.');

	new Notice(parts.join('\n'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTemplateSet(state: PluginState, world: WorldInfo): TemplateSetInfo | null {
	return state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0]
		?? null;
}
