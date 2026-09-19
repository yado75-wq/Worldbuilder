import { App, Notice, normalizePath, TFolder } from 'obsidian';
import { PluginState, WorldBuilderSettings } from '../types/runtime';
import { WorldInfo } from '../types/world';
import { hasLeadingUnderscore } from '../util/names';
import { t } from '../i18n';

export type RenameTemplateSetResult =
	| {
			ok: true;
			oldName: string;
			newName: string;
			archived: boolean;
			worldsUpdated: number;
			worldsLeftOnOldName: number;
	  }
	| {
			ok: false;
			code:
				| 'set-not-found'
				| 'folder-missing'
				| 'invalid-name'
				| 'new-exists'
				| 'cancelled'
				| 'rename-failed';
			detail?: string;
	  };

export interface RenameTemplateSetConfirmLive {
	oldName: string;
	newName: string;
	worlds: WorldInfo[];
	/** Defaults-set warning when oldName === 'defaults' */
	defaultsWarning: boolean;
}

export interface RenameTemplateSetConfirmArchive {
	oldName: string;
	newName: string;
}

/**
 * Rewrite template_set in world _index frontmatter (same rules as Settings → Assign).
 */
export function updateTemplateSetFrontmatter(
	content: string,
	templateSetName: string
): string {
	const frontmatterPattern = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
	const match = content.match(frontmatterPattern);

	if (!match?.[1]) {
		return `---\ntags:\n  - world\ntemplate_set: ${templateSetName}\n---\n\n${content}`;
	}

	const frontmatterBody = match[1];
	const updatedFrontmatter = frontmatterBody.replace(
		/^template_set:.*$/m,
		`template_set: ${templateSetName}`
	);

	if (updatedFrontmatter === frontmatterBody) {
		return content.replace(
			frontmatterPattern,
			`---\n${frontmatterBody}\ntemplate_set: ${templateSetName}\n---\n`
		);
	}

	return content.replace(frontmatterPattern, `---\n${updatedFrontmatter}\n---\n`);
}

export function worldsUsingTemplateSet(
	worlds: readonly WorldInfo[],
	setName: string
): WorldInfo[] {
	return worlds.filter(w => w.templateSet === setName);
}

function err(
	code: Extract<RenameTemplateSetResult, { ok: false }>['code'],
	detail?: string
): RenameTemplateSetResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

/**
 * Rename a live template set folder and optionally rebind selected worlds.
 *
 * - Live → live: rename folder; update template_set only for selectedWorldPaths.
 * - Live → `_…`: archive; no world updates; caller should fix defaultTemplateSet if needed.
 *
 * confirmLive: return selected world paths, or null to cancel.
 * confirmArchive: return true to proceed, false/null to cancel.
 */
export async function renameTemplateSet(
	app: App,
	state: PluginState,
	settings: WorldBuilderSettings,
	oldName: string,
	newNameRaw: string,
	confirmLive: (
		info: RenameTemplateSetConfirmLive
	) => Promise<string[] | null>,
	confirmArchive: (
		info: RenameTemplateSetConfirmArchive
	) => Promise<boolean>
): Promise<RenameTemplateSetResult> {
	const set = state.templateSets.find(s => s.name === oldName);
	if (!set) {
		new Notice(t('notice.template-set-not-found', { name: oldName }));
		return err('set-not-found', oldName);
	}

	const newName = newNameRaw.trim();
	if (!newName) {
		new Notice(t('notice.rename-template-invalid-name'));
		return err('invalid-name');
	}

	if (newName === oldName) {
		return err('cancelled');
	}

	const templatesRoot = normalizePath(
		`${settings.systemFolder}/${settings.templatesFolder}`
	);
	const sourcePath = normalizePath(`${templatesRoot}/${oldName}`);
	const targetPath = normalizePath(`${templatesRoot}/${newName}`);

	const sourceFolder = app.vault.getAbstractFileByPath(sourcePath);
	if (!(sourceFolder instanceof TFolder)) {
		new Notice(t('notice.template-set-folder-missing', { name: oldName }));
		return err('folder-missing', sourcePath);
	}

	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(t('notice.template-set-already-exists', { name: newName }));
		return err('new-exists', newName);
	}

	const boundWorlds = worldsUsingTemplateSet(state.worlds, oldName);
	const archived = hasLeadingUnderscore(newName);

	if (archived) {
		const ok = await confirmArchive({ oldName, newName });
		if (!ok) return err('cancelled');

		try {
			await app.fileManager.renameFile(sourceFolder, targetPath);
		} catch (e) {
			const detail = e instanceof Error ? e.message : String(e);
			new Notice(t('notice.rename-template-failed', { detail }));
			return err('rename-failed', detail);
		}

		new Notice(
			t('notice.rename-template-archived', {
				old: oldName,
				new: newName,
			})
		);
		return {
			ok: true,
			oldName,
			newName,
			archived: true,
			worldsUpdated: 0,
			worldsLeftOnOldName: boundWorlds.length,
		};
	}

	const selectedPaths = await confirmLive({
		oldName,
		newName,
		worlds: boundWorlds,
		defaultsWarning: oldName === 'defaults',
	});
	if (selectedPaths === null) return err('cancelled');

	const selected = new Set(selectedPaths);

	try {
		await app.fileManager.renameFile(sourceFolder, targetPath);
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		new Notice(t('notice.rename-template-failed', { detail }));
		return err('rename-failed', detail);
	}

	let worldsUpdated = 0;
	for (const world of boundWorlds) {
		if (!selected.has(world.path)) continue;
		const content = await app.vault.read(world.indexFile);
		const updated = updateTemplateSetFrontmatter(content, newName);
		await app.vault.modify(world.indexFile, updated);
		worldsUpdated += 1;
	}

	const worldsLeftOnOldName = boundWorlds.length - worldsUpdated;

	new Notice(
		t('notice.rename-template-done', {
			old: oldName,
			new: newName,
			updated: String(worldsUpdated),
			left: String(worldsLeftOnOldName),
		})
	);

	return {
		ok: true,
		oldName,
		newName,
		archived: false,
		worldsUpdated,
		worldsLeftOnOldName,
	};
}
