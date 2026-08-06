import { App, Notice } from 'obsidian';
import { PluginState } from '../types';

/** Make `worldPath` the only active world; all others → inactive on disk. */
export async function setActiveWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<boolean> {
	const target = state.worlds.find(w => w.path === worldPath);
	if (!target) {
		new Notice('World not found.');
		return false;
	}

	for (const world of state.worlds) {
		const next = world.path === worldPath ? 'active' : 'inactive';
		const content = await app.vault.read(world.indexFile);
		const updated = content.replace(/^status:.*$/m, `status: ${next}`);
		if (updated !== content) {
			await app.vault.modify(world.indexFile, updated);
		}
	}

	new Notice(`Active world: "${target.name}".`);
	return true;
}

export async function switchToWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<void> {
	const target = state.worlds.find(w => w.path === worldPath);
	if (!target) {
		new Notice('World not found.');
		return;
	}

	const activeCount = state.worlds.filter(w => w.status === 'active').length;
	// Only short-circuit when already the unique active world
	if (target.status === 'active' && activeCount === 1) {
		new Notice(`"${target.name}" is already the active world.`);
		return;
	}

	await setActiveWorld(app, state, worldPath);
}