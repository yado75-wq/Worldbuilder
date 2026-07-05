import { App, Notice } from 'obsidian';
import { PluginState } from '../types';

export async function switchToWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<void> {

	const targetWorld = state.worlds.find(w => w.path === worldPath);
	if (!targetWorld) {
		new Notice('World not found.');
		return;
	}

	if (targetWorld.status === 'active') {
		new Notice(`"${targetWorld.name}" is already the active world.`);
		return;
	}

	// Deactivate all currently active worlds
	for (const world of state.worlds) {
		if (world.status !== 'active') continue;
		let content = await app.vault.read(world.indexFile);
		content = content.replace(/^status:.*$/m, 'status: inactive');
		await app.vault.modify(world.indexFile, content);
	}

	// Activate target world
	let content = await app.vault.read(targetWorld.indexFile);
	content = content.replace(/^status:.*$/m, 'status: active');
	await app.vault.modify(targetWorld.indexFile, content);

	new Notice(`Switched to "${targetWorld.name}".`);
}
