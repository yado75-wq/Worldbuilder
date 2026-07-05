import { App, Notice } from 'obsidian';
import { PluginState } from '../types';
import { InputModal } from '../ui/InputModal';
import { ConfirmModal } from '../ui/ConfirmModal';

export async function newWorld(
	app: App,
	state: PluginState,
	parentPath: string
): Promise<void> {

	// Resolve template set from active world or first available
	/*const templateSet = state.activeWorld
		? state.templateSets.find(ts => ts.name === state.activeWorld?.templateSet)
		: state.templateSets[0];*/

	const templateSet = state.templateSets.find(ts => ts.isValid);

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
	new Notice(`Creating ${templateSet.worldTemplate.length} subfolders`);
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
	await app.vault.create(`${base}/_index.md`, indexContent);

	new Notice(`"${name}" created${makeActive ? ' and set as active world' : ''}.`);
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
