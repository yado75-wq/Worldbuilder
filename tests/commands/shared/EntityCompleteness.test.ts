import { describe, expect, it } from 'vitest';
import { findMissingMandatoryFields } from '../../../src/commands/shared/EntityCompleteness';
import { FieldDefinition } from '../../../src/types';

const titleField: FieldDefinition = {
	key: 'name', label: 'Name', mandatory: true, type: 'text', display: 'title',
};
const roleField: FieldDefinition = {
	key: 'role', label: 'Role', mandatory: true, type: 'text', display: 'property',
};
const factionField: FieldDefinition = {
	key: 'faction', label: 'Faction', mandatory: true, type: 'link', display: 'property', linkFolder: 'Factions',
};
const nicknameField: FieldDefinition = {
	key: 'nickname', label: 'Nickname', mandatory: false, type: 'text', display: 'property',
};
const historyField: FieldDefinition = {
	key: 'history', label: 'History', mandatory: true, type: 'text', display: 'section',
};

describe('findMissingMandatoryFields', () => {
	const fields = [titleField, roleField, factionField, nicknameField, historyField];

	it('skips the title field even if unset', () => {
		const missing = findMissingMandatoryFields(fields, {}, '');
		expect(missing).not.toContain('Name');
	});

	it('skips non-mandatory fields even if unset', () => {
		const missing = findMissingMandatoryFields(fields, {}, '');
		expect(missing).not.toContain('Nickname');
	});

	it('flags mandatory property fields missing from frontmatter', () => {
		const missing = findMissingMandatoryFields(fields, {}, '');
		expect(missing).toContain('Role');
		expect(missing).toContain('Faction');
	});

	it('does not flag mandatory property fields that have a value', () => {
		const missing = findMissingMandatoryFields(fields, { role: 'Hero', faction: '[[Silver Order]]' }, '## History\nSome history');
		expect(missing).not.toContain('Role');
		expect(missing).not.toContain('Faction');
	});

	it('treats a whitespace-only frontmatter value as missing', () => {
		const missing = findMissingMandatoryFields(fields, { role: '   ' }, '');
		expect(missing).toContain('Role');
	});

	it('flags mandatory section fields with no heading or empty content', () => {
		const missing = findMissingMandatoryFields(fields, { role: 'Hero', faction: '[[X]]' }, '# Title\n\nnothing here');
		expect(missing).toContain('History');
	});

	it('does not flag mandatory section fields that have content', () => {
		const missing = findMissingMandatoryFields(
			fields,
			{ role: 'Hero', faction: '[[X]]' },
			'## History\nBorn in the mountains.'
		);
		expect(missing).not.toContain('History');
	});

	it('returns an empty array when everything mandatory is filled in', () => {
		const missing = findMissingMandatoryFields(
			fields,
			{ role: 'Hero', faction: '[[X]]' },
			'## History\nBorn in the mountains.'
		);
		expect(missing).toEqual([]);
	});

	it('handles undefined frontmatter gracefully', () => {
		const missing = findMissingMandatoryFields(fields, undefined, '');
		expect(missing).toContain('Role');
	});
});
