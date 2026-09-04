import { App, Notice, normalizePath, TFile, TFolder, TAbstractFile } from 'obsidian';
import { WorldInfo } from '../types/world';
import { PluginState } from '../types/runtime';
import { InputModal } from '../formkit';
import { replaceIndexDisplayName } from './shared/WorldIndex';
import { refreshDashboard, worldDashboardPath } from './RefreshDashboardCommand';
import { hasActiveWorldConflict } from '../context/ActiveWorld';
import { hasLeadingUnderscore } from '../util/names';
import { t } from '../i18n';

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
				| 'folder-missing-after-copy'
				| 'leading-underscore';
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
		new Notice(t('notice.active-world-conflict'));
		return err('active-world-conflict');
	}

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice(t('notice.world-not-found'));
		return err('world-not-found');
	}

	const parentPath = world.folder.parent?.path ?? '';
	const defaultName = `${world.folder.name}-copy`;

	const newName = await askName(app, defaultName);
	if (!newName) {
		return err('cancelled');
	}

	if (hasLeadingUnderscore(newName)) {
		new Notice(t('notice.leading-underscore'));
		return err('leading-underscore', newName);
	}

	const targetPath = normalizePath(
		!parentPath || parentPath === '/'
			? newName
			: `${parentPath}/${newName}`
	);

	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(t('notice.already-exists', { name: newName }));
		return err('already-exists', targetPath);
	}

	await app.vault.createFolder(targetPath);
	await copyFolderContents(app, world.folder, targetPath);

	const indexPath = `${targetPath}/_index.md`;
	const indexFile = app.vault.getAbstractFileByPath(indexPath);

	if (!(indexFile instanceof TFile)) {
		new Notice(t('notice.clone-index-missing', { path: targetPath }));
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
		new Notice(t('notice.clone-folder-missing', { path: targetPath }));
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

	new Notice(t('notice.world-cloned', { name: newName, path: targetPath }));
	return { ok: true, path: targetPath };
}

// askName + copyFolderContents + copyNode unchanged

function askName(app: App, initial: string): Promise<string | null> {
	return new Promise((resolve) => {
		let submitted = false;
		new InputModal(
			app,
			t('modal.clone-world-prompt'),
			t('modal.clone-world-placeholder'),
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