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
const timeframeField: FieldDefinition = {
	key: 'timeframe', label: 'Timeframe', mandatory: true, type: 'timeframe', display: 'property',
};
const optionalTimeframeField: FieldDefinition = {
	key: 'duration', label: 'Duration', mandatory: false, type: 'timeframe', display: 'property',
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

describe('findMissingMandatoryFields — timeframe fields (TIME_DESIGN.md §1, §6)', () => {
	const fields = [titleField, timeframeField, optionalTimeframeField];

	it('flags a mandatory timeframe field whose frontmatter key is entirely absent', () => {
		const missing = findMissingMandatoryFields(fields, {}, '');
		expect(missing).toContain('Timeframe');
	});

	it('flags a mandatory timeframe field when frontmatter is undefined', () => {
		const missing = findMissingMandatoryFields(fields, undefined, '');
		expect(missing).toContain('Timeframe');
	});

	it('does not flag a mandatory timeframe field once its key is present', () => {
		const missing = findMissingMandatoryFields(fields, { timeframe: '(1200, 1250)' }, '');
		expect(missing).not.toContain('Timeframe');
	});

	// Presence, not trimmed-string emptiness: this is deliberately unlike the
	// plain-property branch. A malformed or unresolvable-but-present value is
	// the resolution check's job (TimeframeResolutionReport.ts), not this one.
	it('does not flag a present timeframe value even if it would fail to parse or resolve', () => {
		const missing = findMissingMandatoryFields(fields, { timeframe: 'not a real value' }, '');
		expect(missing).not.toContain('Timeframe');
	});

	it('never flags a non-mandatory timeframe field, present or absent', () => {
		const missingWhenAbsent = findMissingMandatoryFields(fields, { timeframe: '(0, 0)' }, '');
		expect(missingWhenAbsent).not.toContain('Duration');

		const missingWhenPresent = findMissingMandatoryFields(
			fields,
			{ timeframe: '(0, 0)', duration: '(1, 2)' },
			''
		);
		expect(missingWhenPresent).not.toContain('Duration');
	});
});
