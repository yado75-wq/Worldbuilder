import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import { buildLinkCandidates } from './shared/EntityContent';
import { worldFolderName } from './shared/WorldIndex';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';

export async function editWorldMeta(
	app: App,
	state: PluginState,
	worldPath: string
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

	const allFields = templateSet.fieldSets['WorldMeta'] ?? [];
	if (allFields.length === 0) {
		new Notice('WorldMeta_Fields.md not found or empty.');
		return;
	}

	if (!isEntityTypeUsable(templateSet, 'WorldMeta')) {
		new Notice('No usable world meta fields defined.');
		return;
	}

	// Include title (name) — prefilled from folder name; saving may rename the folder
	const fields = allFields;
	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice('WorldMeta_Fields.md has no title field.');
		return;
	}

	const folderName = worldFolderName(world);
	const prefill = await buildPrefill(app, world, fields, folderName);
	const linkCandidates = buildLinkCandidates(app, world, fields, templateSet);

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `Edit world meta — ${folderName}`,
			fields,
			prefill,
			linkCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
		});
		modal.open();
	});

	if (!result) return;

	const newName = result.data[titleField.key]?.trim() ?? '';
	if (!newName) {
		new Notice('Name is required.');
		return;
	}

	let indexFile = world.indexFile;
	let effectivePath = worldPath;
	const status = world.status;

	if (newName !== folderName) {
		const parentPath = world.folder.parent?.path ?? '';
		const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;

		if (app.vault.getAbstractFileByPath(newFolderPath)) {
			new Notice(`A folder named "${newName}" already exists.`);
			return;
		}

		await app.fileManager.renameFile(world.folder, newFolderPath);
		effectivePath = newFolderPath;

		const renamedIndex = app.vault.getAbstractFileByPath(`${newFolderPath}/_index.md`);
		if (!(renamedIndex instanceof TFile)) {
			new Notice('World folder was renamed but _index.md could not be found.');
			return;
		}
		indexFile = renamedIndex;
	}

	// Meta fields exclude title for property/section blocks; name comes from newName
	const metaFields = fields.filter(f => f.display !== 'title');
	const newContent = buildIndexContent(
		metaFields,
		result.data,
		newName,
		status,
		world.templateSet
	);
	await app.vault.modify(indexFile, newContent);
	new Notice(`World meta updated for "${newName}".`);

	const dashPath = `${effectivePath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		// state may still hold old path until refreshState; pass effective path
		const refreshedState = {
			...state,
			worlds: state.worlds.map(w =>
				w.path === worldPath
					? { ...w, path: effectivePath, name: newName, indexFile }
					: w
			),
		};
		await refreshDashboard(app, refreshedState, effectivePath);
	}
}

async function buildPrefill(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[],
	folderName: string
): Promise<Record<string, string>> {
	const prefill: Record<string, string> = {};
	const cache = app.metadataCache.getFileCache(world.indexFile);
	const frontmatter = cache?.frontmatter;
	const content = await app.vault.read(world.indexFile);

	for (const f of fields) {
		if (f.display === 'title') {
			prefill[f.key] = folderName;
			continue;
		}
		if (f.display === 'section') {
			const match = content.match(
				new RegExp(`## ${f.label}\\n([\\s\\S]*?)(?=\\n## |$)`)
			);
			prefill[f.key] = match?.[1]?.trim() ?? '';
		} else {
			const val: unknown = frontmatter?.[f.key];
			prefill[f.key] = typeof val === 'string' ? val : '';
		}
	}

	return prefill;
}

function buildIndexContent(
	fields: FieldDefinition[],
	data: Record<string, string | null>,
	worldName: string,
	status: string,
	templateSet: string
): string {
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
		.map(f => `## ${f.label}\n${data[f.key] ?? ''}`)
		.join('\n\n');

	const bodyChunks = [propertiesBlock, sectionsBlock].filter(chunk => chunk.length > 0);

	const frontmatter = [
		'tags:',
		'  - world',
		`status: ${status}`,
		`template_set: ${templateSet}`,
		`name: "${worldName}"`,
		...(frontmatterProps ? [frontmatterProps] : []),
	].join('\n');

	return [`---\n${frontmatter}\n---`, `# ${worldName}`, ...bodyChunks].join('\n\n').trimEnd() + '\n';
}