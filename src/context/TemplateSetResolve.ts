import { TemplateSetInfo } from '../types';

export type TemplateSetResolveResult =
	| { ok: true; set: TemplateSetInfo }
	| { ok: false; reason: 'missing'; requested: string }
	| { ok: false; reason: 'none' }; // registry empty

/**
 * Exact name only. No silent fallback to templateSets[0].
 */
export function resolveTemplateSetByName(
	templateSets: TemplateSetInfo[],
	name: string
): TemplateSetResolveResult {
	if (templateSets.length === 0) {
		return { ok: false, reason: 'none' };
	}
	const set = templateSets.find(ts => ts.name === name);
	if (!set) {
		return { ok: false, reason: 'missing', requested: name };
	}
	return { ok: true, set };
}

export function missingTemplateSetMessage(
	result: Extract<TemplateSetResolveResult, { ok: false }>
): string {
	if (result.reason === 'none') {
		return 'No template sets found. Restore or create one under the templates folder (or reload the plugin).';
	}
	return `Template set "${result.requested}" not found. It may have been renamed or removed. Reassign the world in settings.`;
}