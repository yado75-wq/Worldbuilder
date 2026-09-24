import { describe, expect, it } from 'vitest';
import {
	aggregateKeyStats,
	fieldFromKeyStats,
	fieldsFromKeyStats,
	inferDraftsByType,
	mergeFieldsAddOnly,
	serializeFieldsFile,
	resolveLinkTypesFromTargets,
	suggestFolderTarget,
	mergeFolderRulesContent,
	NoteFrontmatterSample,
} from '../../src/state/inferFieldsFromNotes';
import { FieldDefinition } from '../../src/formkit';
import { parseFieldsWithIssues } from '../../src/state/ParseTemplateLines';

function sample(
	typeTag: string,
	frontmatter: Record<string, unknown>,
	path = 'W/n.md'
): NoteFrontmatterSample {
	return { worldPath: 'W', path, typeTag, frontmatter };
}

describe('aggregateKeyStats / fieldFromKeyStats', () => {
	it('counts keys and ignores tags', () => {
		const samples = [
			sample('character', { tags: ['character'], name: 'Aria', race: 'Elf' }),
			sample('character', { tags: ['character'], name: 'Bor', faction: 'X' }),
		];
		const keys = aggregateKeyStats(samples, 'character');
		const byKey = Object.fromEntries(keys.map(k => [k.key, k]));
		expect(byKey['name']?.presentCount).toBe(2);
		expect(byKey['race']?.presentCount).toBe(1);
		expect(byKey['faction']?.presentCount).toBe(1);
		expect(byKey['tags']).toBeUndefined();
	});

	it('marks name title and mostly mandatory when frequent', () => {
		const stats = aggregateKeyStats(
			[
				sample('character', { name: 'A' }),
				sample('character', { name: 'B' }),
			],
			'character'
		);
		const name = stats.find(s => s.key === 'name')!;
		const field = fieldFromKeyStats(name);
		expect(field.display).toBe('title');
		expect(field.mandatory).toBe(true);
		expect(field.type).toBe('text');
	});

	it('detects wikilink as link type', () => {
		const stats = aggregateKeyStats(
			[
				sample('character', { faction: '[[Guild]]' }),
				sample('character', { faction: '[[Order]]' }),
			],
			'character'
		);
		const field = fieldFromKeyStats(stats[0]!);
		expect(field.type).toBe('link');
	});

	it('detects yaml list of plain strings as multiselect text', () => {
		const stats = aggregateKeyStats(
			[sample('character', { traits: ['Brave', 'Clever'] })],
			'character'
		);
		const field = fieldFromKeyStats(stats[0]!);
		expect(field.type).toBe('multiselect');
		expect(field.multiKind).toBe('text');
	});

	it('detects yaml list of wikilinks as multiselect link (aria gear case)', () => {
		const stats = aggregateKeyStats(
			[sample('character', { gear: ['[[Axe]]', '[[Chainmail]]'] })],
			'character'
		);
		expect(stats[0]?.shapes.listLink).toBe(1);
		expect(stats[0]?.linkTargetBasenames.sort()).toEqual(['Axe', 'Chainmail']);
		const field = fieldFromKeyStats(stats[0]!);
		expect(field.type).toBe('multiselect');
		expect(field.multiKind).toBe('link');
	});

	it('second pass fills linkTypes from target note tags', () => {
		const stats = aggregateKeyStats(
			[sample('character', { gear: ['[[Axe]]', '[[Chainmail]]'] })],
			'character'
		);
		const basenameToTypes = new Map<string, string[]>([
			['Axe', ['Weapon']],
			['Chainmail', ['Armor']],
		]);
		const types = resolveLinkTypesFromTargets(
			stats[0]!.linkTargetBasenames,
			basenameToTypes
		);
		const field = fieldFromKeyStats(stats[0]!, types);
		expect(field.multiKind).toBe('link');
		expect(field.linkTypes).toEqual(['Weapon', 'Armor']);
		const raw = serializeFieldsFile([field]);
		expect(raw).toContain('multiselect:link:Weapon>Armor');
	});
});

describe('mergeFieldsAddOnly', () => {
	it('keeps baseline and appends new keys only', () => {
		const baseline: FieldDefinition[] = [
			{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
			{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
		];
		const inferred: FieldDefinition[] = [
			{ key: 'name', label: 'Name', type: 'link', display: 'title', mandatory: true },
			{ key: 'faction', label: 'Faction', type: 'text', display: 'property', mandatory: false },
		];
		const merged = mergeFieldsAddOnly(baseline, inferred);
		expect(merged.map(f => f.key)).toEqual(['name', 'race', 'faction']);
		expect(merged[0]?.type).toBe('text'); // baseline type kept
	});
});

describe('serializeFieldsFile', () => {
	it('round-trips through parseFieldsWithIssues for simple text fields', () => {
		const fields: FieldDefinition[] = [
			{ key: 'name', label: 'Name', type: 'text', display: 'title', mandatory: true },
			{ key: 'race', label: 'Race', type: 'text', display: 'property', mandatory: false },
		];
		const raw = serializeFieldsFile(fields);
		const parsed = parseFieldsWithIssues(raw, 'Character_Fields.md');
		expect(parsed.fields).toHaveLength(2);
		expect(parsed.fields[0]?.key).toBe('name');
		expect(parsed.fields[0]?.display).toBe('title');
		expect(parsed.fields[0]?.mandatory).toBe(true);
		expect(parsed.fields[1]?.key).toBe('race');
	});

	it('serializes link and multiselect columns', () => {
		const raw = serializeFieldsFile([
			{
				key: 'faction',
				label: 'Faction',
				type: 'link',
				display: 'property',
				mandatory: false,
				linkTypes: ['Faction'],
			},
			{
				key: 'traits',
				label: 'Traits',
				type: 'multiselect',
				display: 'property',
				mandatory: false,
				multiKind: 'text',
				options: ['Brave', 'Clever'],
			},
		]);
		expect(raw).toContain('link:Faction');
		expect(raw).toContain('multiselect:text:"Brave","Clever"');
		const parsed = parseFieldsWithIssues(raw, 'X_Fields.md');
		expect(parsed.fields[0]?.type).toBe('link');
		expect(parsed.fields[1]?.type).toBe('multiselect');
	});
});

describe('inferDraftsByType', () => {
	it('groups by type tag and applies preferred casing', () => {
		const drafts = inferDraftsByType(
			[
				sample('character', { name: 'A', race: 'Elf' }),
				sample('location', { name: 'Town' }),
			],
			{ character: 'Character', location: 'Location' }
		);
		expect(drafts.map(d => d.typeName).sort()).toEqual(['Character', 'Location']);
		expect(drafts.find(d => d.typeName === 'Character')?.noteCount).toBe(1);
	});
});

describe('fieldsFromKeyStats', () => {
	it('ensures single title on name', () => {
		const fields = fieldsFromKeyStats(
			aggregateKeyStats(
				[
					sample('character', { name: 'A', title: 'Hero' }),
					sample('character', { name: 'B', title: 'Villain' }),
				],
				'character'
			)
		);
		const titles = fields.filter(f => f.display === 'title');
		expect(titles).toHaveLength(1);
		expect(titles[0]?.key).toBe('name');
	});
});

describe('suggestFolderTarget / mergeFolderRulesContent', () => {
	it('picks majority first-level folder when support is high', () => {
		// 4/5 = 0.8 meets default minRatio; 3/4 = 0.75 would correctly fall back to *
		const r = suggestFolderTarget([
			{ worldPath: 'W', path: 'W/Characters/A.md' },
			{ worldPath: 'W', path: 'W/Characters/B.md' },
			{ worldPath: 'W', path: 'W/Characters/C.md' },
			{ worldPath: 'W', path: 'W/Characters/D.md' },
			{ worldPath: 'W', path: 'W/Other/E.md' },
		]);
		expect(r.targetFolder).toBe('Characters');
		expect(r.supportCount).toBe(4);
		expect(r.noteCount).toBe(5);
	});

	it('falls back to * when notes are spread or few', () => {
		const r = suggestFolderTarget([
			{ worldPath: 'W', path: 'W/Characters/A.md' },
			{ worldPath: 'W', path: 'W/People/B.md' },
		]);
		expect(r.targetFolder).toBe('*');
	});

	it('merges rules for types in run and keeps others', () => {
		const existing = '- Location | Places\n- Character | OldChars\n';
		const merged = mergeFolderRulesContent(existing, [
			{ entityType: 'Character', targetFolder: 'Characters' },
			{ entityType: 'Weapon', targetFolder: 'Weapons' },
		]);
		expect(merged).toContain('Character | Characters');
		expect(merged).toContain('Location | Places');
		expect(merged).toContain('Weapon | Weapons');
		expect(merged).not.toContain('OldChars');
	});
});
