export const DEFAULT_DASHBOARD_NOTES = '## Notes\n\n_Your notes here survive dashboard refresh._';

export interface EntitySectionInput {
	targetFolder: string;
	count: number;
	list: string;
}

export interface DashboardContentInput {
	worldName: string;
	refreshedAt: string;
	metaProps: string;
	todoBlock: string;
	needsAttention: string;
	subDashboards: string;
	entitySections: EntitySectionInput[];
	preservedSection: string;
}

/**
 * Assembles the dashboard's generated markdown. Every heading gets exactly
 * one blank line above and below it (markdownlint MD022), no run of blank
 * lines is ever stacked (MD012), and the result always ends in exactly one
 * trailing newline (MD047) — built as an array of non-empty chunks joined
 * by a single blank line, rather than a fixed template with slots that
 * stay blank when a section has nothing to show.
 */
export function buildDashboardContent(input: DashboardContentInput, preservedSectionMarker: string): string {
	const frontmatter = `---\ntags:\n  - dashboard\nworld: "${input.worldName}"\n---`;

	const entitySectionChunks = input.entitySections.map(
		s => `## ${s.targetFolder} (${s.count})\n\n${s.list}`
	);

	const chunks = [
		frontmatter,
		`# ${input.worldName} — Dashboard`,
		`_Last refreshed: ${input.refreshedAt}_`,
		'## World meta',
		input.metaProps || '_No meta defined yet. Use Edit world meta to add details._',
		'## TODO',
		input.todoBlock,
		'## Needs attention',
		input.needsAttention,
		'## Sub-dashboards',
		input.subDashboards || '_No sub-dashboards yet._',
		...entitySectionChunks,
		preservedSectionMarker,
		input.preservedSection,
	];

	return chunks.join('\n\n').trimEnd() + '\n';
}
