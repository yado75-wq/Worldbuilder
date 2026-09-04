import { App, Notice } from 'obsidian';
import { TemplateSetInfo } from '../../types/templateSet';
import { WorldInfo } from '../../types/world';
import { PluginState } from '../../types/runtime';
import { FieldDefinition } from '../../formkit';
import { buildEntityContent, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './EntityContent';
import { refreshDashboard, worldDashboardPath } from '../RefreshDashboardCommand';
import { hasLeadingUnderscore } from '../../util/names';
import { t } from '../../i18n';

export type CreateLinkedEntityResult =
	| { ok: true; link: string; path: string }
	| {
			ok: false;
			code:
				| 'no-link-type'
				| 'empty-name'
				| 'already-exists'
				| 'leading-underscore';
			detail?: string;
	  };

function err(
	code: Extract<CreateLinkedEntityResult, { ok: false }>['code'],
	detail?: string
): CreateLinkedEntityResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

/**
 * Hot-create a linked entity from a link field.
 * Placement: concrete folder-rule → that folder; * or no rule → currentEntityFolderPath.
 */
export async function createLinkedEntity(
	app: App,
	state: PluginState,
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	currentEntityFolderPath: string,
	field: FieldDefinition,
	name: string
): Promise<CreateLinkedEntityResult> {
	const entityType = (field.linkTypes?.[0] ?? field.linkFolder)?.trim();
	if (!entityType) {
		return err('no-link-type');
	}

	const trimmedName = name.trim();
	if (!trimmedName) {
		return err('empty-name');
	}
	
	if (hasLeadingUnderscore(trimmedName)) {
		new Notice(t('notice.leading-underscore'));
		return err('leading-underscore', trimmedName);
	}
	const linkedFields = templateSet.fieldSets[entityType];
	const targetFolder = resolveLinkedTargetFolderForType(
		world,
		templateSet,
		entityType,
		currentEntityFolderPath
	);
	await ensureFolder(app, targetFolder);

	const targetPath = `${targetFolder}/${trimmedName}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(
			t('notice.already-exists-in-folder', {
				name: trimmedName,
				folder: targetFolder,
			})
		);
		return err('already-exists', targetPath);
	}

	const content = linkedFields && linkedFields.length > 0
		? buildEntityContent(linkedFields, {}, entityType, trimmedName, DEFAULT_ENTITY_NOTES)
		: buildMinimalEntityContent(entityType, trimmedName, DEFAULT_ENTITY_NOTES);

	await app.vault.create(targetPath, content);
	new Notice(
		t('notice.entity-created', {
			type: entityType,
			name: trimmedName,
		})
	);
	
	const dashPath = worldDashboardPath(world.path);
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, world.path, false);
	}

	return { ok: true, link: `[[${trimmedName}]]`, path: targetPath };
}

function resolveLinkedTargetFolderForType(
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	entityType: string,
	currentEntityFolderPath: string
): string {
	const rule = templateSet.folderRules.find(r => r.entityType === entityType);
	if (rule?.targetFolder && rule.targetFolder !== '*') {
		return `${world.path}/${rule.targetFolder}`;
	}
	return currentEntityFolderPath;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) return;
	await app.vault.createFolder(path);
}