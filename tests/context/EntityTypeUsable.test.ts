import { describe, expect, it } from 'vitest';
import { isEntityTypeUsable } from '../../src/context/EntityTypeUsable';
import { FieldDefinition, TemplateSetInfo } from '../../src/types';
import { resolveTemplateSetForWorld } from '../../src/context/EntityTypeUsable';

function set(fieldSets: Record<string, FieldDefinition[]>): TemplateSetInfo {
	return {
		name: 'defaults',
		path: '_system/templates/defaults',
		isValid: true,
		issues: [],
		folderRules: [],
		worldTemplate: [],
		fieldSets,
	};
}

const title = (key = 'name'): FieldDefinition => ({
	key,
	label: 'Name',
	type: 'text',
	display: 'title',
	mandatory: true,
});

const prop = (key: string): FieldDefinition => ({
	key,
	label: key,
	type: 'text',
	display: 'property',
	mandatory: false,
});

describe('isEntityTypeUsable', () => {
	it('returns false when template set is missing', () => {
		expect(isEntityTypeUsable(undefined, 'Character')).toBe(false);
		expect(isEntityTypeUsable(null, 'Character')).toBe(false);
	});

	it('returns false when field set is missing or empty', () => {
		expect(isEntityTypeUsable(set({}), 'Character')).toBe(false);
		expect(isEntityTypeUsable(set({ Character: [] }), 'Character')).toBe(false);
	});

	it('returns false when fields exist but none is title', () => {
		const ts = set({ Character: [prop('race')] });
		expect(isEntityTypeUsable(ts, 'Character')).toBe(false);
	});

	it('returns true when non-empty fields include a title', () => {
		const ts = set({ Character: [title(), prop('race')] });
		expect(isEntityTypeUsable(ts, 'Character')).toBe(true);
	});

	it('is per-type: usable Character does not make Faction usable', () => {
		const ts = set({
			Character: [title()],
			Faction: [],
		});
		expect(isEntityTypeUsable(ts, 'Character')).toBe(true);
		expect(isEntityTypeUsable(ts, 'Faction')).toBe(false);
	});
});

describe('resolveTemplateSetForWorld', () => {
	const a = set({ Character: [title()] });
	a.name = 'alpha';
	const b = set({ Character: [title()] });
	b.name = 'beta';

	it('returns the set matching the world name', () => {
		expect(resolveTemplateSetForWorld([a, b], 'beta')).toBe(b);
	});

	it('falls back to the first set when name is unknown', () => {
		expect(resolveTemplateSetForWorld([a, b], 'missing')).toBe(a);
	});

	it('returns undefined when the list is empty', () => {
		expect(resolveTemplateSetForWorld([], 'defaults')).toBeUndefined();
	});
});