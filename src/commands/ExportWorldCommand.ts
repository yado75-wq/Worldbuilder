import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types/runtime';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';
import {
	buildManifest,
	packWorldKit,
	type KitFileEntry,
} from '../util/worldKitZip';
import { t } from '../i18n';

export type ExportWorldResult =
	| { ok: true; path: string }
	| {
			ok: false;
			code:
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'cancelled'
				| 'write-failed';
			detail?: string;
	  };

function err(
	code: Extract<ExportWorldResult, { ok: false }>['code'],
	detail?: string
): ExportWorldResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function exportWorld(
	app: App,
	state: PluginState,
	settings: WorldBuilderSettings,
	worldPath: string,
	pluginVersion?: string
): Promise<ExportWorldResult> {
	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice(t('notice.world-not-found'));
		return err('world-not-found');
	}

	const resolved = resolveTemplateSetByName(state.templateSets, world.templateSet);
	if (!resolved.ok) {
		new Notice(missingTemplateSetMessage(resolved));
		return err(
			resolved.reason === 'none' ? 'no-template-sets' : 'missing-template-set',
			resolved.reason === 'missing' ? resolved.requested : undefined
		);
	}
	const templateSet = resolved.set;

	const setFolder = app.vault.getAbstractFileByPath(templateSet.path);
	if (!(setFolder instanceof TFolder)) {
		new Notice(missingTemplateSetMessage({ ok: false, reason: 'missing', requested: templateSet.name }));
		return err('missing-template-set', templateSet.name);
	}

	try {
		const worldFiles = await collectFolderFiles(app, world.folder, world.path);
		const templateSetFiles = await collectFolderFiles(app, setFolder, templateSet.path);

		const manifest = buildManifest({
			worldFolderName: world.folder.name,
			templateSetName: templateSet.name,
			pluginVersion,
		});

		const buffer = await packWorldKit({
			manifest,
			worldFiles,
			templateSetFiles,
		});

		const fileName = `${world.folder.name}-worldbuilder-kit.zip`;
		const savedPath = await saveKitZip(app, settings, fileName, buffer);
		if (!savedPath) {
			return err('cancelled');
		}

		new Notice(t('notice.world-exported', { name: world.folder.name, path: savedPath }));
		return { ok: true, path: savedPath };
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		new Notice(t('notice.kit-export-failed'));
		return err('write-failed', detail);
	}
}

async function collectFolderFiles(
	app: App,
	folder: TFolder,
	rootPath: string
): Promise<KitFileEntry[]> {
	const out: KitFileEntry[] = [];

	async function walk(node: TFolder): Promise<void> {
		for (const child of node.children) {
			if (child instanceof TFolder) {
				await walk(child);
				continue;
			}
			if (!(child instanceof TFile)) continue;
			const rel = child.path.startsWith(rootPath + '/')
				? child.path.slice(rootPath.length + 1)
				: child.name;
			const data = new Uint8Array(await app.vault.readBinary(child));
			out.push({ path: rel, data });
		}
	}

	await walk(folder);
	return out;
}

/** Save dialog when available; else `_system/exports/<fileName>` in the vault. */
async function saveKitZip(
	app: App,
	settings: WorldBuilderSettings,
	fileName: string,
	buffer: ArrayBuffer
): Promise<string | null> {
	const bytes = Buffer.from(buffer);

	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron dialog is only available at runtime on desktop		
		const electron = require('electron') as {
			remote?: { dialog: ElectronDialog };
			dialog?: ElectronDialog;
		};
		const dialog = electron.remote?.dialog ?? electron.dialog;
		if (dialog?.showSaveDialog) {
			const result = await dialog.showSaveDialog({
				title: t('menu.export-world'),
				defaultPath: fileName,
				filters: [{ name: 'World Builder Kit', extensions: ['zip'] }],
			});
			if (result.canceled || !result.filePath) return null;
			// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node fs for writing outside the vault after save dialog
			const fs = require('fs') as typeof import('fs');
			fs.writeFileSync(result.filePath, bytes);
			return result.filePath;
		}
	} catch {
		// fall through to vault write
	}

	const dir = normalizePath(`${settings.systemFolder}/exports`);
	await ensureFolder(app, settings.systemFolder);
	await ensureFolder(app, dir);
	const vaultPath = normalizePath(`${dir}/${fileName}`);
	const existing = app.vault.getAbstractFileByPath(vaultPath);
	if (existing instanceof TFile) {
		await app.vault.modifyBinary(existing, buffer);
	} else {
		await app.vault.createBinary(vaultPath, buffer);
	}
	return vaultPath;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (app.vault.getAbstractFileByPath(path)) return;
	await app.vault.createFolder(path);
}

interface ElectronDialog {
	showSaveDialog: (opts: {
		title?: string;
		defaultPath?: string;
		filters?: { name: string; extensions: string[] }[];
	}) => Promise<{ canceled: boolean; filePath?: string }>;
	showOpenDialog: (opts: {
		properties?: string[];
		filters?: { name: string; extensions: string[] }[];
	}) => Promise<{ canceled: boolean; filePaths: string[] }>;
}