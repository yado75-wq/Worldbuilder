import { describe, expect, it } from 'vitest';
import {
	isReservedEntityType,
	replaceTypeInFieldTypeSpec,
	retagNoteFrontmatter,
	rewriteFieldsFileContent,
	rewriteFolderRulesContent,
} from '../../src/util/entityTypeRewrite';

describe('replaceTypeInFieldTypeSpec', () => {
	it('rewrites link chain segments', () => {
		expect(replaceTypeInFieldTypeSpec('link:Weapon>Armor', 'Weapon', 'Zbran')).toBe(
			'link:Zbran>Armor'
		);
		expect(replaceTypeInFieldTypeSpec('link:Weapon>Armor', 'Armor', 'Zbroj')).toBe(
			'link:Weapon>Zbroj'
		);
	});

	it('rewrites multiselect:link chain', () => {
		expect(
			replaceTypeInFieldTypeSpec('multiselect:link:Weapon>Armor', 'Weapon', 'Zbran')
		).toBe('multiselect:link:Zbran>Armor');
	});

	it('leaves text and select alone', () => {
		expect(replaceTypeInFieldTypeSpec('text', 'Character', 'Postava')).toBe('text');
		expect(replaceTypeInFieldTypeSpec('select:"Character"', 'Character', 'Postava')).toBe(
			'select:"Character"'
		);
	});
});

describe('rewriteFieldsFileContent', () => {
	it('updates type column only', () => {
		const raw =
			'name | Name | mandatory | text | title\n' +
			'gear | Gear | optional | link:Weapon>Armor | property\n';
		const { content, replacements } = rewriteFieldsFileContent(raw, 'Weapon', 'Zbran');
		expect(replacements).toBe(1);
		expect(content).toContain('link:Zbran>Armor');
		expect(content).toContain('name | Name');
	});
});

describe('rewriteFolderRulesContent', () => {
	it('rewrites entity column, keeps folder', () => {
		const raw = 'Character | Characters\nLocation | Locations\n';
		const { content, replacements } = rewriteFolderRulesContent(
			raw,
			'Character',
			'Postava'
		);
		expect(replacements).toBe(1);
		expect(content).toContain('Postava | Characters');
		expect(content).toContain('Location | Locations');
	});
});

describe('retagNoteFrontmatter', () => {
	it('retags list-style tags only', () => {
		const raw = `---
tags:
  - character
  - draft
name: "Aria"
---

# Aria mentions character in body
`;
		const { content, changed } = retagNoteFrontmatter(raw, 'character', 'postava');
		expect(changed).toBe(true);
		expect(content).toContain('- postava');
		expect(content).toContain('- draft');
		expect(content).toContain('mentions character in body');
	});
});

describe('isReservedEntityType', () => {
	it('blocks WorldMeta only', () => {
		expect(isReservedEntityType('WorldMeta')).toBe(true);
		expect(isReservedEntityType('worldmeta')).toBe(true);
		expect(isReservedEntityType('Generic')).toBe(false);
		expect(isReservedEntityType('Character')).toBe(false);
	});
});
