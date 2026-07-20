import { describe, expect, it } from 'vitest';
import { buildDashboardContent, DashboardContentInput, DEFAULT_DASHBOARD_NOTES } from '../../../src/commands/shared/DashboardContentBuilder';

const MARKER = '<!-- AUTO-GENERATED: everything above this line is overwritten on refresh -->';

function baseInput(overrides: Partial<DashboardContentInput> = {}): DashboardContentInput {
	return {
		worldName: 'Aeloria',
		refreshedAt: '1/1/2026, 12:00:00 PM',
		metaProps: '',
		todoBlock: '_No TODO items yet._',
		needsAttention: '_Nothing outstanding._',
		subDashboards: '',
		entitySections: [],
		preservedSection: DEFAULT_DASHBOARD_NOTES,
		...overrides,
	};
}

describe('buildDashboardContent', () => {
	it('never stacks multiple consecutive blank lines (MD012), even with every optional section empty', () => {
		const content = buildDashboardContent(baseInput(), MARKER);
		expect(content).not.toMatch(/\n\n\n/);
	});

	it('gives every heading exactly one blank line below it (MD022)', () => {
		const content = buildDashboardContent(
			baseInput({
				entitySections: [{ targetFolder: 'Characters', count: 2, list: '- [[Characters/aria|aria]]' }],
			}),
			MARKER
		);
		for (const line of content.split('\n')) {
			if (!line.startsWith('#')) continue;
			const idx = content.split('\n').indexOf(line);
			const nextLine = content.split('\n')[idx + 1];
			expect(nextLine).toBe('');
		}
	});

	it('ends with exactly one trailing newline (MD047), regardless of trailing whitespace in preservedSection', () => {
		const content = buildDashboardContent(baseInput({ preservedSection: 'Some notes.\n\n\n' }), MARKER);
		expect(content.endsWith('\n')).toBe(true);
		expect(content.endsWith('\n\n')).toBe(false);
	});

	it('falls back to placeholder text for empty meta/sub-dashboards, never leaving a blank body under the heading', () => {
		const content = buildDashboardContent(baseInput(), MARKER);
		expect(content).toContain('## World meta\n\n_No meta defined yet. Use Edit world meta to add details._');
		expect(content).toContain('## Sub-dashboards\n\n_No sub-dashboards yet._');
	});

	it('renders each entity section with a blank line between its heading and its list', () => {
		const content = buildDashboardContent(
			baseInput({
				entitySections: [
					{ targetFolder: 'Characters', count: 1, list: '- [[Characters/aria|aria]]' },
					{ targetFolder: 'Factions', count: 0, list: '_No entries yet._' },
				],
			}),
			MARKER
		);
		expect(content).toContain('## Characters (1)\n\n- [[Characters/aria|aria]]');
		expect(content).toContain('## Factions (0)\n\n_No entries yet._');
	});

	it('includes the preserved-section marker and content after it', () => {
		const content = buildDashboardContent(baseInput({ preservedSection: 'My custom notes.' }), MARKER);
		expect(content).toContain(`${MARKER}\n\nMy custom notes.`);
	});
});
