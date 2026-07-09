import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition, TemplateSetInfo } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { buildEntityContent, buildLinkCandidates, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './shared/EntityContent';

import { refreshDashboard } from './RefreshDashboardCommand';

export async function createEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	folderPath: string
): Promise<void> {

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return;
	}

	const templateSet = state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0];

	if (!templateSet) {
		new Notice('No template set found.');
		return;
	}

	const fields = templateSet.fieldSets[entityType];
	if (!fields || fields.length === 0) {
		new Notice(`No fields defined for "${entityType}".`);
		return;
	}

	const linkCandidates = buildLinkCandidates(app, world, fields);

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `New ${entityType}`,
			fields,
			prefill: {},
			linkCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
			onCreateLink: async (field, name) => createLinkedEntity(app, state, world, templateSet, folderPath, field, name),
		});
		modal.open();
	});

	if (!result) return;

	// Get title field value for filename
	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice(`No title field defined for "${entityType}".`);
		return;
	}

	const title = result.data[titleField.key]?.trim();
	if (!title) {
		new Notice('Name is required.');
		return;
	}

	// Check for duplicate
	const targetPath = `${folderPath}/${title}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${title}" already exists in ${folderPath}.`);
		return;
	}

	// Build file content
	const content = buildEntityContent(fields, result.data, entityType, title, DEFAULT_ENTITY_NOTES);

	await app.vault.create(targetPath, content);

	// Open the new file
	const newFile = app.vault.getAbstractFileByPath(targetPath);
	if (newFile instanceof TFile) {
		await app.workspace.getLeaf(false).openFile(newFile);
	}

	new Notice(`${entityType} "${title}" created.`);

	// Refresh dashboard if it exists
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath, false);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createLinkedEntity(
	app: App,
	state: PluginState,
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	folderPath: string,
	field: FieldDefinition,
	name: string
): Promise<string | null> {
	const linkedFolderName = field.linkFolder?.trim();
	if (!linkedFolderName) return null;

	const trimmedName = name.trim();
	if (!trimmedName) return null;

	// Find entity type from folder rule (e.g. "Factions" → "Faction")
	const rule = templateSet.folderRules.find(r => r.targetFolder === linkedFolderName);
	const entityType = rule?.entityType ?? linkedFolderName;

	const linkedFields = templateSet.fieldSets[entityType];
	const targetFolder = resolveLinkedTargetFolder(world, templateSet, linkedFolderName, folderPath);
	await ensureFolder(app, targetFolder);

	const targetPath = `${targetFolder}/${trimmedName}.md`;
	if (app.vault.getAbstractFileByPath(targetPath)) {
		new Notice(`"${trimmedName}" already exists in ${targetFolder}.`);
		return null;
	}

	const content = linkedFields && linkedFields.length > 0
		? buildEntityContent(linkedFields, {}, entityType, trimmedName, DEFAULT_ENTITY_NOTES)
		: buildMinimalEntityContent(entityType, trimmedName, DEFAULT_ENTITY_NOTES);

	await app.vault.create(targetPath, content);
	new Notice(`${entityType} "${trimmedName}" created.`);

	const dashPath = `${world.path}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, world.path, false);
	}

	return `[[${trimmedName}]]`;
}

function resolveLinkedTargetFolder(
	world: WorldInfo,
	templateSet: TemplateSetInfo,
	linkedFolderName: string,
	fallbackFolderPath: string
): string {
	// linkedFolderName is the folder name (e.g. "Factions")
	// match against targetFolder in rules
	const rule = templateSet.folderRules.find(
		r => r.targetFolder === linkedFolderName
	);
	if (rule?.targetFolder && rule.targetFolder !== '*') {
		return `${world.path}/${rule.targetFolder}`;
	}
	return fallbackFolderPath;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) return;
	await app.vault.createFolder(path);
}
