import { describe, expect, it } from 'vitest';
import {
	parseFieldsWithIssues,
	parseFolderRulesWithIssues,
} from '../../src/state/ParseTemplateLines';
import { formatValidationIssue } from '../../src/types';

describe('parseFieldsWithIssues', () => {
	it('parses a normal title field', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'name | Name | mandatory | text | title\n',
			'Character_Fields.md'
		);
		expect(fields).toHaveLength(1);
		expect(fields[0]?.key).toBe('name');
		expect(fields[0]?.display).toBe('title');
		expect(issues).toHaveLength(0);
	});

	it('warns on malformed line with file and line', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'only-one-column\nname | Name | mandatory | text | title\n',
			'Character_Fields.md'
		);
		expect(fields).toHaveLength(1);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.kind).toBe('malformed-line');
		expect(issues[0]?.file).toBe('Character_Fields.md');
		expect(issues[0]?.line).toBe(1);
	});

	it('warns on duplicate key and keeps first', () => {
		const raw =
			'name | Name | mandatory | text | title\n' +
			'name | Other | optional | text | property\n';
		const { fields, issues } = parseFieldsWithIssues(raw, 'X_Fields.md');
		expect(fields).toHaveLength(1);
		expect(fields[0]?.label).toBe('Name');
		expect(issues.some(i => i.kind === 'duplicate-field-key' && i.line === 2)).toBe(true);
	});

	it('parses link:Type into linkTypes and linkFolder compat', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'faction | Faction | optional | link:Faction | property\n',
			'Character_Fields.md'
		);
		expect(issues).toHaveLength(0);
		expect(fields[0]?.type).toBe('link');
		expect(fields[0]?.linkTypes).toEqual(['Faction']);
		expect(fields[0]?.linkFolder).toBe('Faction');
	});

	it('parses link:Type1>Type2 into linkTypes chain', () => {
		const { fields } = parseFieldsWithIssues(
			'gear | Gear | optional | link:Weapon>Armor | property\n',
			'Character_Fields.md'
		);
		expect(fields[0]?.linkTypes).toEqual(['Weapon', 'Armor']);
		expect(fields[0]?.linkFolder).toBe('Weapon');
		expect(fields[0]?.linkFallback).toBe('Armor');
	});

		it('parses select with quoted options', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'element | Element | optional | select:"Fire","Ice","Storm" | property\n',
			'Character_Fields.md'
		);
		expect(issues).toHaveLength(0);
		expect(fields[0]?.type).toBe('select');
		expect(fields[0]?.options).toEqual(['Fire', 'Ice', 'Storm']);
	});

	it('warns when select options are not quoted', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'element | Element | optional | select:Fire,Ice | property\n',
			'Character_Fields.md'
		);
		expect(fields[0]?.type).toBe('select');
		expect(fields[0]?.options).toEqual([]);
		expect(issues.some(i => i.message.includes('quoted list'))).toBe(true);
	});

	it('parses multiselect:text with quoted options', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'traits | Traits | optional | multiselect:text:"Brave","Cunning" | property\n',
			'Character_Fields.md'
		);
		expect(issues).toHaveLength(0);
		expect(fields[0]?.type).toBe('multiselect');
		expect(fields[0]?.multiKind).toBe('text');
		expect(fields[0]?.options).toEqual(['Brave', 'Cunning']);
	});

	it('parses multiselect:link type chain', () => {
		const { fields, issues } = parseFieldsWithIssues(
			'gear | Gear | optional | multiselect:link:Weapon>Armor | property\n',
			'Character_Fields.md'
		);
		expect(issues).toHaveLength(0);
		expect(fields[0]?.type).toBe('multiselect');
		expect(fields[0]?.multiKind).toBe('link');
		expect(fields[0]?.linkTypes).toEqual(['Weapon', 'Armor']);
	});

	it('warns on multiselect:timeframe', () => {
		const { issues } = parseFieldsWithIssues(
			't | T | optional | multiselect:timeframe:Foo | property\n',
			'X_Fields.md'
		);
		expect(issues.some(i => i.message.includes('timeframe'))).toBe(true);
	});
});

describe('parseFolderRulesWithIssues', () => {
	it('parses rules and warns on duplicate entity type', () => {
		const raw =
			'Character | Characters\n' +
			'Character | Other\n';
		const { rules, issues } = parseFolderRulesWithIssues(raw);
		expect(rules).toHaveLength(2);
		expect(issues.some(i => i.kind === 'duplicate-folder-rule')).toBe(true);
	});

	it('warns on malformed rule line', () => {
		const { rules, issues } = parseFolderRulesWithIssues('Nope\n');
		expect(rules).toHaveLength(0);
		expect(issues[0]?.kind).toBe('malformed-line');
		expect(issues[0]?.line).toBe(1);
	});
});

describe('formatValidationIssue', () => {
	it('includes kind, file, and line', () => {
		const text = formatValidationIssue({
			severity: 'warning',
			kind: 'malformed-line',
			file: 'folder-rules.md',
			line: 3,
			message: 'Skipped',
		});
		expect(text).toContain('malformed-line');
		expect(text).toContain('folder-rules.md:3');
		expect(text).toContain('Skipped');
	});
});