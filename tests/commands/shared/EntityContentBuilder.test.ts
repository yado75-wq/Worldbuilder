import { describe, expect, it } from 'vitest';
import {
	buildEntityContent,
	buildMinimalEntityContent,
	DEFAULT_ENTITY_NOTES,
} from '../../../src/commands/shared/EntityContentBuilder';
import { PRESERVED_SECTION_MARKER } from '../../../src/util/PreservedSection';
import { FieldDefinition } from '../../../src/types';

const nameField: FieldDefinition = {
	key: 'name', label: 'Name', mandatory: true, type: 'text', display: 'title',
};
const roleField: FieldDefinition = {
	key: 'role', label: 'Role', mandatory: false, type: 'text', display: 'property',
};
const historyField: FieldDefinition = {
	key: 'history', label: 'History', mandatory: false, type: 'text', display: 'section',
};

describe('buildEntityContent', () => {
	const fields = [nameField, roleField, historyField];

	it('lowercases the entity type for the frontmatter tag', () => {
		const result = buildEntityContent(fields, {}, 'Character', 'Aria', DEFAULT_ENTITY_NOTES);
		expect(result).toContain('- character');
	});

	it('includes the title as an H1 and frontmatter name', () => {
		const result = buildEntityContent(fields, {}, 'Character', 'Aria', DEFAULT_ENTITY_NOTES);
		expect(result).toContain('name: "Aria"');
		expect(result).toContain('# Aria');
	});

	it('includes property fields only when a value is present', () => {
		const withValue = buildEntityContent(fields, { role: 'Hero' }, 'Character', 'Aria', DEFAULT_ENTITY_NOTES);
		expect(withValue).toContain('- **Role:** Hero');
		expect(withValue).toContain('role: "Hero"');

		const withoutValue = buildEntityContent(fields, {}, 'Character', 'Aria', DEFAULT_ENTITY_NOTES);
		expect(withoutValue).not.toContain('**Role:**');
		expect(withoutValue).not.toContain('role:');
	});

	it('renders section fields as their own H2 blocks', () => {
		const result = buildEntityContent(
			fields,
			{ history: 'Born in the mountains.' },
			'Character',
			'Aria',
			DEFAULT_ENTITY_NOTES
		);
		expect(result).toContain('## History\nBorn in the mountains.');
	});

	it('omits section fields with no value', () => {
		const result = buildEntityContent(fields, {}, 'Character', 'Aria', DEFAULT_ENTITY_NOTES);
		expect(result).not.toContain('## History');
	});

	it('appends the marker followed by the given preserved section', () => {
		const result = buildEntityContent(fields, {}, 'Character', 'Aria', 'my custom preserved notes');
		expect(result).toContain(PRESERVED_SECTION_MARKER);
		expect(result.indexOf(PRESERVED_SECTION_MARKER)).toBeLessThan(result.indexOf('my custom preserved notes'));
	});
});

describe('buildMinimalEntityContent', () => {
	it('produces frontmatter, title, marker and preserved section with no field data', () => {
		const result = buildMinimalEntityContent('Faction', 'The Silver Order', 'some preserved text');
		expect(result).toContain('- faction');
		expect(result).toContain('# The Silver Order');
		expect(result).toContain(PRESERVED_SECTION_MARKER);
		expect(result).toContain('some preserved text');
	});
});
