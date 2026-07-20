/**
 * `snake_case` frontmatter key → "Title Case" display label (e.g.
 * `time_unit` → "Time Unit"). Used by RefreshDashboardCommand.ts's World
 * Meta section. Previously that section only capitalized a key's first
 * letter ("Time_unit"), invisible until `time_unit`/`time_zero`
 * (TIME_DESIGN.md §4) became its first underscored keys.
 */
export function formatMetaLabel(key: string): string {
	return key
		.split('_')
		.filter(Boolean)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
