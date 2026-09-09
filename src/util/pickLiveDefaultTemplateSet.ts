import { TemplateSetInfo } from '../types/templateSet';

export type PickDefaultResult =
	| { name: string; switched: false }
	| { name: string; switched: true; from: string }
	| { name: null; switched: false };

/**
 * Resolve which live template set name to use as settings.defaultTemplateSet.
 * Never returns a name that is not in `templateSets` (archived `_…` sets are already omitted by scan).
 */
export function pickLiveDefaultTemplateSet(
	templateSets: TemplateSetInfo[],
	preferredName: string
): PickDefaultResult {
	if (templateSets.length === 0) {
		return { name: null, switched: false };
	}

	const preferred = preferredName.trim();
	if (preferred && templateSets.some(ts => ts.name === preferred)) {
		return { name: preferred, switched: false };
	}

	const defaults = templateSets.find(ts => ts.name === 'defaults');
	if (defaults) {
		return { name: 'defaults', switched: true, from: preferred || '(empty)' };
	}

	const valid = templateSets.find(ts => ts.isValid);
	if (valid) {
		return { name: valid.name, switched: true, from: preferred || '(empty)' };
	}

	const first = templateSets[0]!;
	return { name: first.name, switched: true, from: preferred || '(empty)' };
}