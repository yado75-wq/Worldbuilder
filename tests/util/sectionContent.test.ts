import { describe, expect, it } from 'vitest';
import { escapeRegExp, extractSectionContent } from '../../src/util/sectionContent';

describe('escapeRegExp', () => {
	it('escapes regex metacharacters', () => {
		expect(escapeRegExp('History (pre-War)')).toBe('History \\(pre-War\\)');
		expect(escapeRegExp('Cost [gold]')).toBe('Cost \\[gold\\]');
		expect(escapeRegExp('50% chance?')).toBe('50% chance\\?');
	});

	it('leaves plain text untouched', () => {
		expect(escapeRegExp('History')).toBe('History');
	});
});

describe('extractSectionContent', () => {
	it('extracts content under a matching heading', () => {
		const content = '# Title\n\n## History\nBorn in the mountains.\n\n## Notes\nOther stuff';
		expect(extractSectionContent(content, 'History')).toBe('Born in the mountains.');
	});

	it('returns empty string when the heading is missing', () => {
		const content = '# Title\n\n## Notes\nOther stuff';
		expect(extractSectionContent(content, 'History')).toBe('');
	});

	it('returns empty string when the heading has no content beneath it', () => {
		const content = '# Title\n\n## History\n\n## Notes\nOther stuff';
		expect(extractSectionContent(content, 'History')).toBe('');
	});

	it('correctly matches labels containing regex metacharacters', () => {
		const content = '## History (pre-War)\nSome content here';
		expect(extractSectionContent(content, 'History (pre-War)')).toBe('Some content here');
	});

	it('stops at the next H2 heading, not the end of the string', () => {
		const content = '## History\nPart one\nPart two\n\n## Later\nUnrelated';
		expect(extractSectionContent(content, 'History')).toBe('Part one\nPart two');
	});
});
