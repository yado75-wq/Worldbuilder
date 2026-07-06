import { App, Notice, TFile, getAllTags } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';

export async function editEntity(
	app: App,
	state: PluginState,
	worldPath: string,
	entityType: string,
	filePath: string
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

	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		new Notice('File not found.');
		return;
	}

	// Build prefill from existing file
	const prefill = await buildPrefill(app, file, fields);
	const linkCandidates = buildLinkCandidates(app, world, fields);

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `Edit ${entityType}: ${file.basename}`,
			fields,
			prefill,
			linkCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
		});
		modal.open();
	});

	if (!result) return;

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

	// Build updated content
	const content = buildEntityContent(fields, result.data, entityType, title);

	// Handle rename if name changed
	if (file.basename !== title) {
		const newPath = `${file.parent?.path ?? ''}/${title}.md`;
		if (app.vault.getAbstractFileByPath(newPath)) {
			new Notice(`Cannot rename: "${title}" already exists.`);
			return;
		}
		await app.fileManager.renameFile(file, newPath);
		const renamedFile = app.vault.getAbstractFileByPath(newPath);
		if (renamedFile instanceof TFile) {
			await app.vault.modify(renamedFile, content);
			await app.workspace.getLeaf(true).openFile(renamedFile);
		}
	} else {
		await app.vault.modify(file, content);
		await app.workspace.getLeaf(true).openFile(file);
	}

	new Notice(`${entityType} "${title}" updated.`);

	// Refresh dashboard if it exists
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildPrefill(
	app: App,
	file: TFile,
	fields: FieldDefinition[]
): Promise<Record<string, string>> {
	const prefill: Record<string, string> = {};
	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;
	const content = await app.vault.read(file);

	for (const f of fields) {
		if (f.display === 'section') {
			const match = content.match(
				new RegExp(`## ${f.label}\\n([\\s\\S]*?)(?=\\n## |$)`)
			);
			prefill[f.key] = match?.[1]?.trim() ?? '';
		} else if (f.type === 'link') {
			// Strip [[ ]] for display in dropdown
			const val: unknown = frontmatter?.[f.key];
			const raw = typeof val === 'string' ? val : '';
			prefill[f.key] = raw.replace(/^\[\[|\]\]$/g, '');
		} else if (f.display === 'title') {
			// Use frontmatter name if present, fall back to filename
			const val: unknown = frontmatter?.['name'];
			prefill[f.key] = typeof val === 'string' && val.trim()
				? val.trim()
				: file.basename;
		} else {
			const val: unknown = frontmatter?.[f.key];
			prefill[f.key] = typeof val === 'string' ? val : '';
		}
	}

	return prefill;
}

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
