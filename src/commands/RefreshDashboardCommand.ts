import { App, Notice, TFile, getAllTags } from 'obsidian';
import { PluginState, WorldInfo, TemplateSetInfo } from '../types';
import { PRESERVED_SECTION_MARKER, extractPreservedSection } from '../util/PreservedSection';
import { findMissingMandatoryFields } from './shared/EntityCompleteness';

const DEFAULT_NOTES = '## Notes\n_Your notes here survive dashboard refresh._';

export async function refreshDashboard(
	app: App,
	state: PluginState,
	worldPath: string,
	openAfterRefresh = true
): Promise<void> {

	const world = state.worlds.find(w => w.path === worldPath);
	if (!world) {
		new Notice('World not found.');
		return;
	}

	const templateSet = findTemplateSet(state, world);
	if (!templateSet) {
		new Notice(`Template set "${world.templateSet}" not found.`);
		return;
	}

	// Read existing dashboard to preserve notes section
	const dashPath = `${worldPath}/_dashboard.md`;
	const existingDash = app.vault.getAbstractFileByPath(dashPath);
	let preservedSection = DEFAULT_NOTES;

	if (existingDash instanceof TFile) {
		const existingContent = await app.vault.read(existingDash);
		preservedSection = extractPreservedSection(existingContent, DEFAULT_NOTES);
	}

	// Read world meta from _index.md directly — cache may not be updated yet
	const indexContent = await app.vault.read(world.indexFile);

	// Parse frontmatter from raw content
	const frontmatterMatch = indexContent.match(/^---\n([\s\S]*?)\n---/);
	const frontmatterContent = frontmatterMatch?.[1] ?? '';
	const skipKeys = ['tags', 'status', 'name', 'template_set', 'position'];
	const metaProps = frontmatterContent.length > 0
		? frontmatterContent
			.split('\n')
			.map(line => line.match(/^(\w+):\s*"?([^"]*)"?$/))
			.filter((m): m is RegExpMatchArray => m !== null && !skipKeys.includes(m[1] ?? ''))
			.filter(m => (m[2] ?? '').trim().length > 0)
			.map(m => {
				const key = m[1] ?? '';
				const val = (m[2] ?? '').trim();
				return `- **${key.charAt(0).toUpperCase() + key.slice(1)}:** ${val}`;
			})
			.join('\n')
		: '';

	// Extract TODO section from _index.md body
	const todoMatch = indexContent.match(/## TODO\n([\s\S]*?)(?=\n## |$)/);
	const todoBlock = todoMatch?.[1]?.trim() ?? '_No TODO items yet._';

	// Discover sub-dashboards (files starting with _ except _index and _dashboard)
	const worldFolder = world.folder;
	const subDashboards = worldFolder.children
		.filter((f): f is TFile =>
			f instanceof TFile &&
			f.basename.startsWith('_') &&
			f.basename !== '_index' &&
			f.basename !== '_dashboard'
		)
		.map(f => `- [[${f.path}|${f.basename}]]`)
		.join('\n');

	// Build entity sections from folder rules
	const entitySections = templateSet.folderRules
		.filter(rule => rule.targetFolder !== '*')
		.map(rule => {
			const folderPath = `${worldPath}/${rule.targetFolder}`;
			const folder = app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof Object) || !('children' in folder)) {
				return `## ${rule.targetFolder} (0)\n_No entries yet._`;
			}

			const entities = app.vault.getFiles().filter(f =>
				f.path.startsWith(folderPath + '/') &&
				f.extension === 'md' &&
				f.basename !== '_index' &&
				!getAllTags(app.metadataCache.getFileCache(f) ?? {})
					?.some(t => t === '#generic' || t === 'generic')
			);

			const count = entities.length;
			const list = count > 0
				? entities.map(f => `- [[${f.path}|${f.basename}]]`).join('\n')
				: '_No entries yet._';

			return `## ${rule.targetFolder} (${count})\n${list}`;
		})
		.join('\n\n');

	// Find entities missing mandatory fields, for the Needs attention section
	const needsAttention = await buildNeedsAttentionSection(app, worldPath, templateSet);

	// Assemble dashboard content
	const now = new Date().toLocaleString();
	const content =
`---
tags:
  - dashboard
world: "${world.name}"
---

# ${world.name} — Dashboard
_Last refreshed: ${now}_

## World meta
${metaProps || '_No meta defined yet. Use Edit world meta to add details._'}

## TODO
${todoBlock}

## Needs attention
${needsAttention}

## Sub-dashboards
${subDashboards || '_No sub-dashboards yet._'}

${entitySections}

${PRESERVED_SECTION_MARKER}

${preservedSection}`;

	// Write or update dashboard file
	if (existingDash instanceof TFile) {
		await app.vault.modify(existingDash, content);
	} else {
		await app.vault.create(dashPath, content);
	}

	// Open the dashboard — skipped for silent auto-refreshes (e.g. after
	// editing an entity), so it doesn't steal focus from what's on screen
	if (openAfterRefresh) {
		const dashFile = app.vault.getAbstractFileByPath(dashPath);
		if (dashFile instanceof TFile) {
			await app.workspace.getLeaf(false).openFile(dashFile);
		}
	}

	new Notice(`Dashboard refreshed for "${world.name}".`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTemplateSet(state: PluginState, world: WorldInfo): TemplateSetInfo | null {
	return state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0]
		?? null;
}

async function buildNeedsAttentionSection(
	app: App,
	worldPath: string,
	templateSet: TemplateSetInfo
): Promise<string> {
	const incomplete: string[] = [];

	for (const rule of templateSet.folderRules) {
		if (rule.targetFolder === '*') continue;

		const fields = templateSet.fieldSets[rule.entityType];
		if (!fields || fields.length === 0) continue;

		const mandatoryFields = fields.filter(f => f.mandatory && f.display !== 'title');
		if (mandatoryFields.length === 0) continue;

		// Only read file content (needed for section-type fields) when this
		// entity type actually has a mandatory section field to check
		const needsContent = mandatoryFields.some(f => f.display === 'section');

		const folderPath = `${worldPath}/${rule.targetFolder}`;
		const entities = app.vault.getFiles().filter(f =>
			f.path.startsWith(folderPath + '/') &&
			f.extension === 'md' &&
			f.basename !== '_index' &&
			!getAllTags(app.metadataCache.getFileCache(f) ?? {})
				?.some(t => t === '#generic' || t === 'generic')
		);

		for (const entity of entities) {
			const frontmatter = app.metadataCache.getFileCache(entity)?.frontmatter;
			const generatedContent = needsContent
				? (await app.vault.read(entity)).split(PRESERVED_SECTION_MARKER)[0] ?? ''
				: '';

			const missing = findMissingMandatoryFields(mandatoryFields, frontmatter, generatedContent);
			if (missing.length > 0) {
				incomplete.push(`- [[${entity.path}|${entity.basename}]] — missing: ${missing.join(', ')}`);
			}
		}
	}

	return incomplete.length > 0 ? incomplete.join('\n') : '_Nothing outstanding._';
}
