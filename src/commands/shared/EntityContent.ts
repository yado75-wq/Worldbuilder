import { App, getAllTags } from 'obsidian';
import { FieldDefinition, WorldInfo } from '../../types';

// Pure content builders live in EntityContentBuilder.ts (no Obsidian
// dependency, unit tested directly). Re-exported here so existing imports
// of `from './shared/EntityContent'` keep working unchanged.
export { buildEntityContent, buildMinimalEntityContent, DEFAULT_ENTITY_NOTES } from './EntityContentBuilder';

export function buildLinkCandidates(
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
