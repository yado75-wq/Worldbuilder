import { App, Notice } from 'obsidian';
import { PluginState, WorldInfo, FieldDefinition } from '../types';
import { EntityFormModal } from '../ui/EntityFormModal';
import { refreshDashboard } from './RefreshDashboardCommand';
import { buildLinkCandidates } from './shared/EntityContent';

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
	// Filter out title field — world name is not editable through meta form
	const fields = allFields.filter(f => f.display !== 'title');
	if (allFields.length === 0) {
		new Notice('WorldMeta_Fields.md not found or empty.');
		return;
	}

	const prefill = await buildPrefill(app, world, fields);
	const linkCandidates = buildLinkCandidates(app, world, fields, templateSet);

	const result = await new Promise<{ data: Record<string, string | null> } | null>((resolve) => {
		let submitted = false;
		const modal = new EntityFormModal(app, {
			title: `Edit world meta — ${world.name}`,
			fields,
			prefill,
			linkCandidates,
			onSubmit: (r) => { submitted = true; resolve(r); },
			onCancel: () => { if (!submitted) resolve(null); },
		});
		modal.open();
	});

	if (!result) return;

	// Use world.name directly — name is not part of meta form
	const newContent = buildIndexContent(fields, result.data, world.name, world.status, world.templateSet);
	await app.vault.modify(world.indexFile, newContent);
	new Notice(`World meta updated for "${world.name}".`);

	// Refresh dashboard if it exists
	const dashPath = `${worldPath}/_dashboard.md`;
	if (app.vault.getAbstractFileByPath(dashPath)) {
		await refreshDashboard(app, state, worldPath);
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildPrefill(
	app: App,
	world: WorldInfo,
	fields: FieldDefinition[]
): Promise<Record<string, string>> {
	const prefill: Record<string, string> = {};
	const cache = app.metadataCache.getFileCache(world.indexFile);
	const frontmatter = cache?.frontmatter;
	const content = await app.vault.read(world.indexFile);

	for (const f of fields) {
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

	// Only chunks that actually have content contribute a blank-line
	// separator — a fresh world with nothing filled in yet shouldn't leave
	// stacked blank lines where the empty properties/sections blocks used
	// to sit (same fix as EntityContentBuilder.ts's buildEntityContent).
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
