import { TemplateSetInfo } from '../types/templateSet';
import { t } from '../i18n';

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
		return t('notice.template-sets-none');
	}
	return t('notice.template-set-missing', { name: result.requested });
}