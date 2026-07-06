import { App, Notice, TFile, getAllTags } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';

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
	const content = buildEntityContent(fields, result.data, entityType, title);

	await app.vault.create(targetPath, content);

	// Open the new file
	const newFile = app.vault.getAbstractFileByPath(targetPath);
	if (newFile instanceof TFile) {
		await app.workspace.getLeaf(true).openFile(newFile);
	}

	new Notice(`${entityType} "${title}" created.`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLinkCandidates(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[]
): Record<string, string[]> {
	const candidates: Record<string, string[]> = {};

	for (const f of fields) {
		if (f.type !== 'link' || !f.linkFolder) continue;

		const folderPath = `${world.path}/${f.linkFolder}`;
		const files = app.vault.getFiles().filter(file => {
			if (!file.path.startsWith(folderPath + '/')) return false;
			if (file.extension !== 'md') return false;
			if (file.basename === '_index') return false;
			const cache = app.metadataCache.getFileCache(file);
			const tags = getAllTags(cache ?? {}) ?? [];
			return !tags.includes('generic') && !tags.includes('#generic');
		});

		candidates[f.key] = files.map(file => file.basename);

		const current = candidates[f.key];
		if (current !== undefined && current.length === 0 && f.linkFallback) {
			const fallbackPath = `${world.path}/${f.linkFallback}`;
			const fallbackFiles = app.vault.getFiles().filter(file =>
				file.path.startsWith(fallbackPath + '/') &&
				file.extension === 'md' &&
				file.basename !== '_index'
			);
			candidates[f.key] = fallbackFiles.map(file => file.basename);
		}
	}

	return candidates;
}

function buildEntityContent(
	fields: FieldDefinition[],
	data: Record<string, string | null>,
	entityType: string,
	title: string
): string {
	const tag = entityType.toLowerCase();

	const frontmatterProps = fields
		.filter(f => f.display === 'property' && data[f.key])
		.map(f => `${f.key}: "${data[f.key] ?? ''}"`)
		.join('\n');

	const propertiesBlock = fields
		.filter(f => f.display === 'property' && data[f.key])
		.map(f => `- **${f.label}:** ${data[f.key] ?? ''}`)
		.join('\n');

	const sectionsBlock = fields
		.filter(f => f.display === 'section' && data[f.key])
		.map(f => `\n## ${f.label}\n${data[f.key] ?? ''}`)
		.join('\n');

	return `---
tags:
  - ${tag}
name: "${title}"
${frontmatterProps}
---

# ${title}

${propertiesBlock}
${sectionsBlock}`;
}
