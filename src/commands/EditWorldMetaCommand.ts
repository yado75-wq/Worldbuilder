import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition, FormResult } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import { buildFieldCandidates } from './shared/EntityContent';
import { worldFolderName } from './shared/WorldIndex';
import { isEntityTypeUsable } from '../context/EntityTypeUsable';
import { formatMultiselectFrontmatterLine, formatMultiselectPropertyBullet } from './shared/MultiselectValues';
import { requireUniqueActiveWorld } from '../context/ActiveWorld';
import { resolveTemplateSetByName, missingTemplateSetMessage } from '../context/TemplateSetResolve';

export type EditWorldMetaResult =
	| { ok: true; path: string }
	| {
			ok: false;
			code:
				| 'active-world-conflict'
				| 'world-not-found'
				| 'no-template-sets'
				| 'missing-template-set'
				| 'worldmeta-empty'
				| 'worldmeta-not-usable'
				| 'no-title-field'
				| 'cancelled'
				| 'name-required'
				| 'folder-name-conflict'
				| 'index-missing-after-rename';
			detail?: string;
	  };

function err(
	code: Extract<EditWorldMetaResult, { ok: false }>['code'],
	detail?: string
): EditWorldMetaResult {
	return detail !== undefined ? { ok: false, code, detail } : { ok: false, code };
}

export async function editWorldMeta(
	app: App,
	state: PluginState,
	worldPath: string
): Promise<EditWorldMetaResult> {
	if (!requireUniqueActiveWorld(state, msg => new Notice(msg))) return err('active-world-conflict');

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
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

	const allFields = templateSet.fieldSets['WorldMeta'] ?? [];
	if (allFields.length === 0) {
		new Notice('WorldMeta_Fields.md not found or empty.');
		return err('worldmeta-empty');
	}

	if (!isEntityTypeUsable(templateSet, 'WorldMeta')) {
		new Notice('No usable world meta fields defined.');
		return err('worldmeta-not-usable');
	}

	const fields = allFields;
	const titleField = fields.find(f => f.display === 'title');
	if (!titleField) {
		new Notice('WorldMeta_Fields.md has no title field.');
		return err('no-title-field');
	}

	const folderName = worldFolderName(world);
	const prefill = await buildPrefill(app, world, fields, folderName);

	const { linkGroups, timeframeAnchors } = buildFieldCandidates(
		app, world, fields, templateSet
	);

	const result = await new Promise<FormResult | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `Edit world meta — ${folderName}`,
			fields,
			prefill,
			linkCandidateGroups: linkGroups,
			timeframeCandidates: timeframeAnchors,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
		});
		modal.open();
	});

	if (!result){ 
		return err('cancelled');
	}

	const rawName = result.data[titleField.key];
	const newName = typeof rawName === 'string' ? rawName.trim() : '';
	if (!newName) {
		new Notice('Name is required.');
		return err('name-required');
	}

	let indexFile = world.indexFile;
	let effectivePath = worldPath;
	const status = world.status;

	if (newName !== folderName) {
		const parentPath = world.folder.parent?.path ?? '';
		const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;

		if (app.vault.getAbstractFileByPath(newFolderPath)) {
			new Notice(`A folder named "${newName}" already exists.`);
			return err('folder-name-conflict', newFolderPath);
		}

		await app.fileManager.renameFile(world.folder, newFolderPath);
		effectivePath = newFolderPath;

		const renamedIndex = app.vault.getAbstractFileByPath(`${newFolderPath}/_index.md`);
		if (!(renamedIndex instanceof TFile)) {
			new Notice('World folder was renamed but _index.md could not be found.');
			return err('index-missing-after-rename', newFolderPath);
		}
		indexFile = renamedIndex;
	}

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
	return { ok: true, path: effectivePath };
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
		} else if (f.type === 'multiselect') {
			const val: unknown = frontmatter?.[f.key];
			if (Array.isArray(val)) {
				prefill[f.key] = JSON.stringify(
					val.map(v => (typeof v === 'string' ? v : String(v))).filter(Boolean)
				);
			} else if (typeof val === 'string' && val.trim()) {
				prefill[f.key] = JSON.stringify([val]);
			} else {
				prefill[f.key] = '[]';
			}
		} else {
			const val: unknown = frontmatter?.[f.key];
			prefill[f.key] = typeof val === 'string' ? val : '';
		}
	}

	return prefill;
}

function hasValue(v: string | string[] | null | undefined): boolean {
	if (v == null) return false;
	if (Array.isArray(v)) return v.length > 0;
	return v.trim().length > 0;
}

function buildIndexContent(
	fields: FieldDefinition[],
	data: Record<string, string | string[] | null>,
	worldName: string,
	status: string,
	templateSet: string
): string {
	const frontmatterPropChunks: string[] = [];
	for (const f of fields) {
		if (f.display !== 'property') continue;
		const raw = data[f.key];
		if (!hasValue(raw)) continue;
		if (f.type === 'multiselect' && Array.isArray(raw)) {
			const block = formatMultiselectFrontmatterLine(f.key, raw);
			if (block) frontmatterPropChunks.push(block);
		} else if (typeof raw === 'string') {
			frontmatterPropChunks.push(`${f.key}: "${raw.replace(/"/g, '\\"')}"`);
		}
	}
	const frontmatterProps = frontmatterPropChunks.join('\n');

	const propertiesBlock = fields
		.filter(f => f.display === 'property' && hasValue(data[f.key]))
		.map(f => {
			const raw = data[f.key];
			if (f.type === 'multiselect' && Array.isArray(raw)) {
				return formatMultiselectPropertyBullet(f.label, raw);
			}
			return `- **${f.label}:** ${typeof raw === 'string' ? raw : ''}`;
		})
		.join('\n');

	const sectionsBlock = fields
		.filter(f => f.display === 'section' && hasValue(data[f.key]) && !Array.isArray(data[f.key]))
		.map(f => {
			const raw = data[f.key];
			return `## ${f.label}\n${typeof raw === 'string' ? raw : ''}`;
		})
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