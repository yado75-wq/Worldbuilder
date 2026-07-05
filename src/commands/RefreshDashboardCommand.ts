import { App, Notice, TFile } from 'obsidian';
import { PluginState, WorldInfo, TemplateSetInfo } from '../types';

const MARKER = '<!-- AUTO-GENERATED: everything above this line is overwritten on refresh -->';
const DEFAULT_NOTES = '## Notes\n_Your notes here survive dashboard refresh._';

export async function refreshDashboard(
	app: App,
	state: PluginState,
	worldPath: string
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
		const markerIndex = existingContent.indexOf(MARKER);
		if (markerIndex !== -1) {
			const afterMarker = existingContent.slice(markerIndex + MARKER.length).trim();
			if (afterMarker.length > 0) preservedSection = afterMarker;
		}
	}

	// Read world meta from _index.md
	const indexContent = await app.vault.read(world.indexFile);
	const meta = app.metadataCache.getFileCache(world.indexFile)?.frontmatter;

	// Build meta properties block — skip internal fields
	const skipKeys = ['tags', 'status', 'name', 'template_set', 'position'];
	const metaProps = meta
		? Object.entries(meta)
			.filter(([k]) => !skipKeys.includes(k))
			.filter(([, v]) => v !== null && v !== undefined && v !== '')
			.map(([k, v]) => `- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${String(v)}`)
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
				!app.metadataCache.getFileCache(f)?.frontmatter?.['tags']
					?.toString().includes('generic')
			);

			const count = entities.length;
			const list = count > 0
				? entities.map(f => `- [[${f.path}|${f.basename}]]`).join('\n')
				: '_No entries yet._';

			return `## ${rule.targetFolder} (${count})\n${list}`;
		})
		.join('\n\n');

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

## Sub-dashboards
${subDashboards || '_No sub-dashboards yet._'}

${entitySections}

${MARKER}

${preservedSection}`;

	// Write or update dashboard file
	if (existingDash instanceof TFile) {
		await app.vault.modify(existingDash, content);
	} else {
		await app.vault.create(dashPath, content);
	}

	// Open the dashboard
	const dashFile = app.vault.getAbstractFileByPath(dashPath);
	if (dashFile instanceof TFile) {
		await app.workspace.getLeaf(true).openFile(dashFile);
	}

	new Notice(`Dashboard refreshed for "${world.name}".`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findTemplateSet(state: PluginState, world: WorldInfo): TemplateSetInfo | null {
	return state.templateSets.find(ts => ts.name === world.templateSet)
		?? state.templateSets[0]
		?? null;
}
