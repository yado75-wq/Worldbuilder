import { describe, expect, it } from 'vitest';
import {
	parseFieldsWithIssues,
	parseFolderRulesWithIssues,
} from '../../src/state/parseTemplateLines';
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