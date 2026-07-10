import { describe, expect, it } from 'vitest';
import { PRESERVED_SECTION_MARKER, extractPreservedSection } from '../../src/util/PreservedSection';

describe('extractPreservedSection', () => {
	it('returns the content after the marker when present', () => {
		const content = `# Title\n\nsome generated stuff\n\n${PRESERVED_SECTION_MARKER}\n\n## Notes\nmy own notes here`;
		expect(extractPreservedSection(content, 'DEFAULT')).toBe('## Notes\nmy own notes here');
	});

	it('trims surrounding whitespace from the preserved content', () => {
		const content = `generated\n${PRESERVED_SECTION_MARKER}\n\n\n  spaced out notes  \n\n\n`;
		expect(extractPreservedSection(content, 'DEFAULT')).toBe('spaced out notes');
	});

	it('falls back to defaultSection when the marker is present but nothing follows it', () => {
		const content = `generated\n${PRESERVED_SECTION_MARKER}\n\n   \n`;
		expect(extractPreservedSection(content, 'DEFAULT')).toBe('DEFAULT');
	});

	it('uses the first marker occurrence if it somehow appears more than once', () => {
		const content = `a\n${PRESERVED_SECTION_MARKER}\nfirst\n${PRESERVED_SECTION_MARKER}\nsecond`;
		const result = extractPreservedSection(content, 'DEFAULT');
		expect(result).toContain('first');
	});

	it('treats the whole body as preserved when no marker exists (legacy file, avoids data loss)', () => {
		const content = `---\ntags:\n  - character\nname: "Aria"\n---\n\n# Aria\n\n- **Role:** Hero\n\nSome freeform notes I wrote by hand.`;
		const result = extractPreservedSection(content, 'DEFAULT');
		expect(result).toContain('Some freeform notes I wrote by hand.');
		expect(result).toContain('- **Role:** Hero');
	});

	it('falls back to defaultSection for a legacy file with an empty body', () => {
		const content = `---\ntags:\n  - character\nname: "Aria"\n---\n\n`;
		expect(extractPreservedSection(content, 'DEFAULT')).toBe('DEFAULT');
	});

	it('falls back to defaultSection when there is no frontmatter and no marker at all', () => {
		expect(extractPreservedSection('', 'DEFAULT')).toBe('DEFAULT');
		expect(extractPreservedSection('just some plain text, no frontmatter', 'DEFAULT')).toBe('DEFAULT');
	});
});
