import { describe, expect, it } from 'vitest';
import { pickLiveDefaultTemplateSet } from '../../src/util/pickLiveDefaultTemplateSet';
import { TemplateSetInfo } from '../../src/types/templateSet';

function set(name: string, isValid = true): TemplateSetInfo {
	return {
		name,
		path: `_system/templates/${name}`,
		isValid,
		issues: [],
		folderRules: [],
		worldTemplate: [],
		fieldSets: {},
	};
}

describe('pickLiveDefaultTemplateSet', () => {
	it('keeps preferred when live', () => {
		const sets = [set('defaults'), set('fantasy')];
		expect(pickLiveDefaultTemplateSet(sets, 'fantasy')).toEqual({
			name: 'fantasy',
			switched: false,
		});
	});

	it('prefers live defaults when preferred missing', () => {
		const sets = [set('defaults'), set('fantasy')];
		expect(pickLiveDefaultTemplateSet(sets, 'archived')).toEqual({
			name: 'defaults',
			switched: true,
			from: 'archived',
		});
	});

	it('does not invent defaults when only other live sets exist', () => {
		const sets = [set('fantasy'), set('horror')];
		expect(pickLiveDefaultTemplateSet(sets, 'defaults')).toEqual({
			name: 'fantasy',
			switched: true,
			from: 'defaults',
		});
	});

	it('returns null when registry empty', () => {
		expect(pickLiveDefaultTemplateSet([], 'defaults')).toEqual({
			name: null,
			switched: false,
		});
	});

	it('prefers valid over invalid when falling back', () => {
		const sets = [set('broken', false), set('ok', true)];
		expect(pickLiveDefaultTemplateSet(sets, 'gone')).toEqual({
			name: 'ok',
			switched: true,
			from: 'gone',
		});
	});
});