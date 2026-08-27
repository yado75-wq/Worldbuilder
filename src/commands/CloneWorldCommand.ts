import { App, Notice, normalizePath, TFile, TFolder, TAbstractFile } from 'obsidian';
import { WorldInfo } from '../types/world';
import { PluginState } from '../types/runtime';
import { InputModal } from '../ui/InputModal';
import { replaceIndexDisplayName } from './shared/WorldIndex';
import { refreshDashboard, worldDashboardPath } from './RefreshDashboardCommand';
import { hasActiveWorldConflict } from '../context/ActiveWorld';

export type CloneWorldResult =
	| { ok: true; path: string }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'cancelled'
				| 'already-exists'
				| 'index-missing-after-copy'
				| 'folder-missing-after-copy';
			detail?: string;
	  };

function err(
	code: Extract<CloneWorldResult, { ok: false }>['code'],
	detail?: string
): CloneWorldResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

/**
 * Copy a world folder tree under a new name.
 * Clone is always status: inactive; display name matches the new folder name.
 */
export async function cloneWorld(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<CloneWorldResult> {
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

	const parentPath = world.folder.parent?.path ?? '';
	const defaultName = `${world.folder.name}-copy`;

	const newName = await askName(app, defaultName);
	if (!newName) {
		return err('cancelled');
	}

	const targetPath = normalizePath(
		!parentPath || parentPath === '/'
			? newName
			: `${parentPath}/${newName}`
	);

	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${newName}" already exists.`);
		return err('already-exists', targetPath);
	}

	await app.vault.createFolder(targetPath);
	await copyFolderContents(app, world.folder, targetPath);

	const indexPath = `${targetPath}/_index.md`;
	const indexFile = app.vault.getAbstractFileByPath(indexPath);

	if (!(indexFile instanceof TFile)) {
		new Notice(`Clone created at "${targetPath}" but _index.md was not found.`);
		return err('index-missing-after-copy', targetPath);
	}

	let content = await app.vault.read(indexFile);
	if (/^status:\s*.*$/m.test(content)) {
		content = content.replace(/^status:\s*.*$/m, 'status: inactive');
	} else if (/^---\s*\r?\n/.test(content)) {
		content = content.replace(/^---\s*\r?\n/, '---\nstatus: inactive\n');
	}
	content = replaceIndexDisplayName(content, newName);
	await app.vault.modify(indexFile, content);

	const folder = app.vault.getAbstractFileByPath(targetPath);
	if (!(folder instanceof TFolder)) {
		new Notice(`Clone folder "${targetPath}" could not be resolved after copy.`);
		return err('folder-missing-after-copy', targetPath);
	}

	const clonedWorld: WorldInfo = {
		...world,
		name: newName,
		path: targetPath,
		folder,
		indexFile,
		status: 'inactive',
	};
	
	const dashPath = worldDashboardPath(targetPath);
	if (app.vault.getAbstractFileByPath(dashPath)) {
		const stateWithClone: PluginState = {
			...state,
			worlds: [...state.worlds, clonedWorld],
		};
		await refreshDashboard(app, stateWithClone, targetPath, false);
	}

	new Notice(`World "${newName}" created (inactive) at "${targetPath}".`);
	return { ok: true, path: targetPath };
}

// askName + copyFolderContents + copyNode unchanged

function askName(app: App, initial: string): Promise<string | null> {
	return new Promise((resolve) => {
		let submitted = false;
		new InputModal(
			app,
			'Name for cloned world',
			'My World copy',
			initial,
			(value) => {
				submitted = true;
				const trimmed = value.trim();
				resolve(trimmed.length > 0 ? trimmed : null);
			},
			() => {
				if (!submitted) resolve(null);
			}
		).open();
	});
}

async function copyFolderContents(
	app: App,
	source: TFolder,
	targetPath: string
): Promise<void> {
	for (const child of source.children) {
		await copyNode(app, child, targetPath);
	}
}

async function copyNode(
	app: App,
	node: TAbstractFile,
	targetParentPath: string
): Promise<void> {
	const dest = normalizePath(`${targetParentPath}/${node.name}`);
	if (node instanceof TFolder) {
		await app.vault.createFolder(dest);
		for (const child of node.children) {
			await copyNode(app, child, dest);
		}
		return;
	}
	if (node instanceof TFile) {
		const data = await app.vault.read(node);
		await app.vault.create(dest, data);
	}
}