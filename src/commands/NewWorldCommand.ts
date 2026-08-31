import { App, Notice, TFolder } from 'obsidian';
import { WorldInfo } from '../types/world';
import { PluginState, WorldBuilderSettings } from '../types/runtime';
import { InputModal } from '../formkit';
import { ConfirmModal } from '../ui/ConfirmModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import { t } from '../i18n';

export type NewWorldResult =
	| { ok: true; path: string; madeActive: boolean }
	| {
			ok: false;
			code:
				| 'no-template-sets'
				| 'template-set-invalid'
				| 'cancelled'
				| 'already-exists';
			detail?: string;
	  };

function err(
	code: Extract<NewWorldResult, { ok: false }>['code'],
	detail?: string
): NewWorldResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function newWorld(
	app: App,
	settings: WorldBuilderSettings,
	state: PluginState,
	parentPath: string
): Promise<NewWorldResult> {
	// Prefer configured default, then first valid set (intentional for *new* worlds — not world-bound resolve)
	const preferredSetName = settings.defaultTemplateSet || state.activeWorld?.templateSet || '';
	const templateSet = state.templateSets.find(ts => ts.name === preferredSetName)
		?? state.templateSets.find(ts => ts.isValid)
		?? state.templateSets[0];

	if (!templateSet) {
		new Notice(t('notice.no-template-sets'));
		return err('no-template-sets');
	}

	if (!templateSet.isValid) {
		new Notice(t('notice.template-set-invalid', { name: templateSet.name }));
		return err('template-set-invalid', templateSet.name);
	}

	const name = await askInput(app, t('modal.new-world-prompt'), t('modal.new-world-placeholder'), '');
	if (!name) {
		return err('cancelled');
	}

	const base = parentPath ? `${parentPath}/${name}` : name;

	if (app.vault.getAbstractFileByPath(base)) {
		new Notice(t('notice.already-exists', { name }));
		return err('already-exists', base);
	}

	const makeActive = await askConfirm(app, t('modal.make-active-world-confirm', { name }));

	await app.vault.createFolder(base);
	for (const sub of templateSet.worldTemplate) {
		await app.vault.createFolder(`${base}/${sub}`);
	}

	if (makeActive) {
		await deactivateAllWorlds(app, state);
	}

	const indexContent = buildMinimalIndex(name, makeActive ? 'active' : 'inactive', templateSet.name);
	const indexFile = await app.vault.create(`${base}/_index.md`, indexContent);

	new Notice(
		makeActive
			? t('notice.world-created-active', { name })
			: t('notice.world-created', { name })
	);

	const newFolder = app.vault.getAbstractFileByPath(base);
	if (newFolder instanceof TFolder) {
		const created: WorldInfo = {
			name,
			path: base,
			folder: newFolder,
			indexFile,
			status: makeActive ? 'active' : 'inactive',
			templateSet: templateSet.name,			
			worldTemplate: templateSet.worldTemplate,
		};
		const newState: PluginState = {
			...state,
			worlds: [...state.worlds, created],
		};
		await refreshDashboard(app, newState, base);
	}

	return { ok: true, path: base, madeActive: makeActive };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deactivateAllWorlds(app: App, state: PluginState): Promise<void> {
	for (const world of state.worlds) {
		if (world.status !== 'active') continue;
		let content = await app.vault.read(world.indexFile);
		content = content.replace(/^status:.*$/m, 'status: inactive');
		await app.vault.modify(world.indexFile, content);
	}
}

function buildMinimalIndex(name: string, status: string, templateSet: string): string {
	return `---\ntags:\n  - world\nstatus: ${status}\ntemplate_set: ${templateSet}\nname: "${name}"\n---\n\n# ${name}\n`;
}

function askInput(
	app: App,
	prompt: string,
	placeholder: string,
	initialValue: string
): Promise<string | null> {
	return new Promise((resolve) => {
		let submitted = false;
		const modal = new InputModal(
			app,
			prompt,
			placeholder,
			initialValue,
			(value) => { submitted = true; resolve(value); },
			() => { if (!submitted) resolve(null); }
		);
		modal.open();
	});
}

function askConfirm(app: App, prompt: string): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, prompt, resolve).open();
	});
}
