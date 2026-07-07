import { App, Notice, TFolder } from 'obsidian';
import { PluginState, WorldBuilderSettings, WorldInfo } from '../types';
import { InputModal } from '../ui/InputModal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { refreshDashboard } from './RefreshDashboardCommand';

export async function newWorld(
	app: App,
	settings: WorldBuilderSettings,
	state: PluginState,
	parentPath: string
): Promise<void> {

	// Resolve template set — prefer the configured default, then fall back to the first valid set
	const preferredSetName = settings.defaultTemplateSet || state.activeWorld?.templateSet || '';
	const templateSet = state.templateSets.find(ts => ts.name === preferredSetName)
		?? state.templateSets.find(ts => ts.isValid)
		?? state.templateSets[0];

	if (!templateSet) {
		new Notice('No template sets found. Create one in _system/templates/ first.');
		return;
	}

	if (!templateSet.isValid) {
		new Notice(`Template set "${templateSet.name}" has errors. Check plugin settings.`);
		return;
	}

	// Step 1 — Ask for world name
	const name = await askInput(app, 'New world name', 'My World', '');
	if (!name) return;

	// Build base path
	const base = parentPath ? `${parentPath}/${name}` : name;

	// Check if already exists
	if (app.vault.getAbstractFileByPath(base)) {
		new Notice(`"${name}" already exists.`);
		return;
	}

	// Step 2 — Make active?
	const makeActive = await askConfirm(app, `Make "${name}" the active world?`);

	// Step 3 — Create folders
	await app.vault.createFolder(base);
	for (const sub of templateSet.worldTemplate) {
		await app.vault.createFolder(`${base}/${sub}`);
	}

	// Step 4 — Deactivate other worlds if making active
	if (makeActive) {
		await deactivateAllWorlds(app, state);
	}

	// Step 5 — Create _index.md
	const indexContent = buildMinimalIndex(name, makeActive ? 'active' : 'inactive', templateSet.name);
	const indexFile = await app.vault.create(`${base}/_index.md`, indexContent);

	new Notice(`"${name}" created${makeActive ? ' and set as active world' : ''}.`);

	// Create dashboard immediately using the new world's folder
	const newFolder = app.vault.getAbstractFileByPath(base);
	if (newFolder instanceof TFolder) {
		const newWorld: WorldInfo = {
			name,
			path: base,
			folder: newFolder,
			indexFile,
			status: makeActive ? 'active' : 'inactive',
			templateSet: templateSet.name,
			folderRules: templateSet.folderRules,
			worldTemplate: templateSet.worldTemplate,
		};
		const newState: PluginState = {
			...state,
			worlds: [...state.worlds, newWorld],
		};
		await refreshDashboard(app, newState, base);
	}
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
