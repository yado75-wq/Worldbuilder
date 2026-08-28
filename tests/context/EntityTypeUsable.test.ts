import { describe, expect, it } from 'vitest';
import { FieldDefinition } from '../../src/formkit';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { isEntityTypeUsable,
		 isPluginMenuSuppressedPath,		 
		 listUsableWildcardTypes, 
} from '../../src/context/EntityTypeUsable';

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

describe('listUsableWildcardTypes', () => {
	it('returns empty when template set is missing', () => {
		expect(listUsableWildcardTypes(undefined)).toEqual([]);
		expect(listUsableWildcardTypes(null)).toEqual([]);
	});

	it('includes usable types not listed in folder-rules (auto *)', () => {
		const ts = set({
			Character: [title()],
			Faction: [title()],
		});
		ts.folderRules = [];
		expect(listUsableWildcardTypes(ts).sort()).toEqual(['Character', 'Faction'].sort());
	});

	it('includes explicit * rules when usable', () => {
		const ts = set({ Quest: [title()] });
		ts.folderRules = [{ entityType: 'Quest', targetFolder: '*' }];
		expect(listUsableWildcardTypes(ts)).toEqual(['Quest']);
	});

	it('does not auto-* a type that has a concrete folder rule', () => {
		const ts = set({
			Character: [title()],
			Quest: [title()],
		});
		ts.folderRules = [{ entityType: 'Character', targetFolder: 'Characters' }];
		expect(listUsableWildcardTypes(ts)).toEqual(['Quest']);
	});

	it('omits unlisted types that are not usable', () => {
		const ts = set({
			Character: [title()],
			Broken: [prop('x')],
		});
		ts.folderRules = [];
		expect(listUsableWildcardTypes(ts)).toEqual(['Character']);
	});

	it('omits WorldMeta even when unlisted and usable', () => {
		const ts = set({
			Character: [title()],
			WorldMeta: [title()],
		});
		ts.folderRules = [];
		expect(listUsableWildcardTypes(ts)).toEqual(['Character']);
	});

	it('includes Generic when unlisted and usable', () => {
		const ts = set({
			Generic: [title()],
		});
		ts.folderRules = [];
		expect(listUsableWildcardTypes(ts)).toEqual(['Generic']);
	});

	it('does not duplicate when type is both explicit * and would be unlisted', () => {
		const ts = set({ Quest: [title()] });
		ts.folderRules = [{ entityType: 'Quest', targetFolder: '*' }];
		expect(listUsableWildcardTypes(ts)).toEqual(['Quest']);
	});
});

describe('isPluginMenuSuppressedPath', () => {
	it('allows vault root and normal folders', () => {
		expect(isPluginMenuSuppressedPath('/')).toBe(false);
		expect(isPluginMenuSuppressedPath('MyWorld')).toBe(false);
		expect(isPluginMenuSuppressedPath('MyWorld/Characters')).toBe(false);
	});

	it('suppresses underscore world and its subfolders', () => {
		expect(isPluginMenuSuppressedPath('_Archived')).toBe(true);
		expect(isPluginMenuSuppressedPath('_Archived/Chapter1')).toBe(true);
	});

	it('suppresses underscore subfolder inside a live world', () => {
		expect(isPluginMenuSuppressedPath('MyWorld/_notes')).toBe(true);
	});

	it('suppresses entire _system tree including templates', () => {
		expect(isPluginMenuSuppressedPath('_system')).toBe(true);
		expect(isPluginMenuSuppressedPath('_system/other')).toBe(true);
		expect(isPluginMenuSuppressedPath('_system/templates')).toBe(true);
		expect(isPluginMenuSuppressedPath('_system/templates/defaults')).toBe(true);
		expect(isPluginMenuSuppressedPath('_system/templates/defaults/nested')).toBe(true);
	});
});