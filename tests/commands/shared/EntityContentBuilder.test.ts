import { describe, expect, it } from 'vitest';
import { buildEntityContent, buildTimeframeSection, DEFAULT_ENTITY_NOTES } from '../../../src/commands/shared/EntityContentBuilder';
import { FieldDefinition } from '../../../src/types';

const nameField: FieldDefinition = {
	key: 'name', label: 'Name', mandatory: true, type: 'text', display: 'title',
};
const roleField: FieldDefinition = {
	key: 'role', label: 'Role', mandatory: false, type: 'text', display: 'property',
};
const timeframeField: FieldDefinition = {
	key: 'timeframe', label: 'Timeframe', mandatory: true, type: 'timeframe', display: 'property',
};

describe('buildTimeframeSection', () => {
	it('renders a placeholder when the value is unset', () => {
		const section = buildTimeframeSection(timeframeField, null);
		expect(section).toContain('## Timeframe');
		expect(section).toContain('_Not yet set._');
	});

	it('renders a placeholder for an empty string the same as null/undefined', () => {
		expect(buildTimeframeSection(timeframeField, '')).toContain('_Not yet set._');
		expect(buildTimeframeSection(timeframeField, '   ')).toContain('_Not yet set._');
	});

	it('shows the value under Resolved when there are no anchors to look up (it is already absolute)', () => {
		const section = buildTimeframeSection(timeframeField, '(1200, 1250)');
		expect(section).toContain('**Resolved:** (1200, 1250)');
		expect(section).not.toContain('**Stored:**');
	});

	it('renders a resolved value when resolution succeeded', () => {
		const section = buildTimeframeSection(timeframeField, '(1200, 1250)', { ok: true, display: '1200–1250' });
		expect(section).toContain('**Resolved:** 1200–1250');
		expect(section).not.toContain('(1200, 1250)'); // supplied resolution wins over the raw fallback
	});

	it('renders the <unresolved> placeholder when resolution failed, never omitting the section', () => {
		const section = buildTimeframeSection(timeframeField, '(0, years, [[Missing]])', { ok: false });
		expect(section).toContain('**Resolved:** <unresolved>');
	});

	it('lists referenced entities on a plain (non-code) line so Obsidian actually links them', () => {
		const section = buildTimeframeSection(
			timeframeField,
			'((0, , [[Start Era]]), (0, , [[End Era]]))'
		);
		expect(section).toContain('**References:** [[Start Era]], [[End Era]]');
		// The reference line itself must not be inside a backtick span, or
		// Obsidian won't parse the [[links]] at all.
		const referenceLine = section.split('\n').find(l => l.startsWith('**References:**'));
		expect(referenceLine).not.toContain('`');
	});

	it('de-duplicates a repeated anchor referenced by both sides', () => {
		const section = buildTimeframeSection(timeframeField, '((0, , [[Founding]]), (5, , [[Founding]]))');
		expect(section).toContain('**References:** [[Founding]]');
	});

	it('omits the References line entirely when the value has no links', () => {
		const section = buildTimeframeSection(timeframeField, '(1200, 1250)');
		expect(section).not.toContain('**References:**');
	});
});

describe('buildEntityContent — timeframe fields (§8)', () => {
	const fields = [nameField, roleField, timeframeField];

	it('always generates the timeframe section, even when the field was left unset', () => {
		const content = buildEntityContent(fields, { name: 'Coronation', role: null, timeframe: null }, 'Event', 'Coronation', '');
		expect(content).toContain('## Timeframe');
		expect(content).toContain('_Not yet set._');
	});

	it('quotes the timeframe value in frontmatter like any other property', () => {
		const content = buildEntityContent(
			fields,
			{ name: 'Coronation', role: null, timeframe: '(1200, 1200)' },
			'Event',
			'Coronation',
			''
		);
		expect(content).toContain('timeframe: "(1200, 1200)"');
	});

	it('does not duplicate the raw timeframe value in the plain properties bullet list', () => {
		const content = buildEntityContent(
			fields,
			{ name: 'Coronation', role: 'Monarch', timeframe: '(1200, 1200)' },
			'Event',
			'Coronation',
			''
		);
		expect(content).toContain('- **Role:** Monarch');
		expect(content).not.toContain('- **Timeframe:**');
	});

	it('still generates a properties bullet for a normal non-timeframe field', () => {
		const content = buildEntityContent(fields, { name: 'X', role: 'Monarch', timeframe: null }, 'Event', 'X', '');
		expect(content).toContain('- **Role:** Monarch');
	});

	it('passes resolution info through to the generated section', () => {
		const content = buildEntityContent(
			fields,
			{ name: 'Coronation', role: null, timeframe: '(1200, 1200)' },
			'Event',
			'Coronation',
			'',
			{ timeframe: { ok: true, display: '1200' } }
		);
		expect(content).toContain('**Resolved:** 1200');
	});

	it('has exactly one blank line before the H1 title, after the frontmatter', () => {
		const content = buildEntityContent(fields, { name: 'X', role: null, timeframe: null }, 'Event', 'X', '');
		expect(content).toMatch(/^---\n[\s\S]*?\n---\n\n# X\n/);
	});

	it('does not stack multiple blank lines when only the timeframe field has content (no other properties or sections)', () => {
		const content = buildEntityContent(
			fields,
			{ name: 'ww druha', role: null, timeframe: '((0, , [[Start Era]]), (0, , [[End Era]]))' },
			'Event',
			'ww druha',
			DEFAULT_ENTITY_NOTES
		);
		// No run of 2+ blank lines anywhere in the generated body.
		expect(content).not.toMatch(/\n\n\n/);
		expect(content).toContain('# ww druha\n\n## Timeframe');
	});

	it('does not stack blank lines when every optional block is empty', () => {
		const content = buildEntityContent(
			[nameField],
			{ name: 'Bare' },
			'Event',
			'Bare',
			DEFAULT_ENTITY_NOTES
		);
		expect(content).not.toMatch(/\n\n\n/);
	});
});
