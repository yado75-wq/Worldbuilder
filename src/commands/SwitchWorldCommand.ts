import { App, Notice } from 'obsidian';
import { PluginState } from '../types/runtime';
import { t } from '../i18n';

export type SetActiveWorldResult =
	| { ok: true; path: string }
	| { ok: false; code: 'world-not-found' | 'already-active'; detail?: string };


function errSet(
	code: Extract<SetActiveWorldResult, { ok: false }>['code'],
	detail?: string
): SetActiveWorldResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

/** Make `worldPath` the only active world; all others → inactive on disk. */
export async function setActiveWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<SetActiveWorldResult> {
	const target = state.worlds.find(w => w.path === worldPath);
	if (!target) {
		new Notice(t('notice.world-not-found'));
		return errSet('world-not-found', worldPath);
	}

	for (const world of state.worlds) {
		const next = world.path === worldPath ? 'active' : 'inactive';
		const content = await app.vault.read(world.indexFile);
		const updated = content.replace(/^status:.*$/m, `status: ${next}`);
		if (updated !== content) {
			await app.vault.modify(world.indexFile, updated);
		}
	}

	new Notice(t('notice.active-world-set', { name: target.name }));
	return { ok: true, path: worldPath };
}

export async function switchToWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<SetActiveWorldResult> {
	const target = state.worlds.find(w => w.path === worldPath);
	if (!target) {
		new Notice(t('notice.world-not-found'));
		return errSet('world-not-found', worldPath);
	}

	const activeCount = state.worlds.filter(w => w.status === 'active').length;
	if (target.status === 'active' && activeCount === 1) {
		new Notice(t('notice.already-active-world', { name: target.name }));
		return errSet('already-active', worldPath);
	}

	return setActiveWorld(app, state, worldPath);
}