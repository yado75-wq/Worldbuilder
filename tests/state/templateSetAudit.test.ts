import { describe, expect, it } from 'vitest';
import {
	collectLinkTargetTypes,
	fieldsWithoutRuleIssues,
	missingLinkTargetIssues,
	worldsUsingTemplateSet,
	auditTemplateSet,
} from '../../src/state/templateSetAudit';
import { FieldDefinition } from '../../src/formkit';
import { TemplateSetInfo } from '../../src/types/templateSet';
import { WorldInfo } from '../../src/types/world';

function textTitle(): FieldDefinition {
	return {
		key: 'name',
		label: 'Name',
		type: 'text',
		display: 'title',
		mandatory: true,
	};
}

function linkField(...linkTypes: string[]): FieldDefinition {
	return {
		key: 'ref',
		label: 'Ref',
		type: 'link',
		display: 'property',
		mandatory: false,
		linkTypes,
		linkFolder: linkTypes[0],
		linkFallback: linkTypes[1],
	};
}

describe('worldsUsingTemplateSet', () => {
	it('filters by template_set name', () => {
		const worlds = [
			{ name: 'A', path: 'A', templateSet: 'defaults', status: 'active' },
			{ name: 'B', path: 'B', templateSet: 'fantasy', status: 'inactive' },
			{ name: 'C', path: 'C', templateSet: 'defaults', status: 'inactive' },
		] as WorldInfo[];

		expect(worldsUsingTemplateSet(worlds, 'defaults').map(w => w.name)).toEqual([
			'A',
			'C',
		]);
		expect(worldsUsingTemplateSet(worlds, 'missing')).toEqual([]);
	});
});

describe('collectLinkTargetTypes / missingLinkTargetIssues', () => {
	it('collects link and multiselect:link types', () => {
		const fields: FieldDefinition[] = [
			linkField('Weapon', 'Armor'),
			{
				key: 'gear',
				label: 'Gear',
				type: 'multiselect',
				multiKind: 'link',
				display: 'property',
				mandatory: false,
				linkTypes: ['Tool'],
			},
		];
		expect(collectLinkTargetTypes(fields).sort()).toEqual(
			['Armor', 'Tool', 'Weapon'].sort()
		);
	});

	it('reports missing link targets once per file/target', () => {
		const fieldSets: Record<string, FieldDefinition[]> = {
			Character: [textTitle(), linkField('Faction'), linkField('Faction')],
			// Faction missing
		};
		const issues = missingLinkTargetIssues(fieldSets);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.kind).toBe('link-target-missing');
		expect(issues[0]?.file).toBe('Character_Fields.md');
		expect(issues[0]?.message).toContain('Faction');
	});

	it('accepts case-insensitive field set match', () => {
		const fieldSets: Record<string, FieldDefinition[]> = {
			Character: [linkField('faction')],
			Faction: [textTitle()],
		};
		expect(missingLinkTargetIssues(fieldSets)).toHaveLength(0);
	});
});

describe('fieldsWithoutRuleIssues', () => {
	it('emits info when type has fields but no rule', () => {
		const issues = fieldsWithoutRuleIssues(
			{ Character: [textTitle()], WorldMeta: [textTitle()] },
			[{ entityType: 'Location' }]
		);
		expect(issues.some(i => i.file === 'Character_Fields.md')).toBe(true);
		expect(issues.some(i => i.file === 'WorldMeta_Fields.md')).toBe(false);
	});
});

describe('auditTemplateSet', () => {
	it('lists worlds and counts severities', () => {
		const set: TemplateSetInfo = {
			name: 'defaults',
			path: '_system/templates/defaults',
			isValid: false,
			issues: [
				{ severity: 'error', kind: 'link-target-missing', message: 'x' },
				{ severity: 'info', kind: 'empty-folder-rules', message: 'y' },
			],
			folderRules: [],
			worldTemplate: [],
			fieldSets: {},
		};
		const worlds = [
			{ name: 'W', path: 'W', templateSet: 'defaults', status: 'active' },
		] as WorldInfo[];

		const result = auditTemplateSet(set, worlds);
		expect(result.usedBy).toHaveLength(1);
		expect(result.errorCount).toBe(1);
		expect(result.infoCount).toBe(1);
	});
});
