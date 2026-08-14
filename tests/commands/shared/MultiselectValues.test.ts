import { describe, expect, it } from 'vitest';
import {
	orderSelectedBySource,
	parseStoredMultiselect,
	formatMultiselectFrontmatterLine,
} from '../../../src/commands/shared/MultiselectValues';

describe('orderSelectedBySource', () => {
	it('follows source order not selection order', () => {
		const source = ['[[Axe]]', '[[Sword]]', '[[Mail]]'];
		expect(orderSelectedBySource(['[[Mail]]', '[[Axe]]'], source))
			.toEqual(['[[Axe]]', '[[Mail]]']);
	});
});

describe('parseStoredMultiselect', () => {
	it('reads yaml-like arrays', () => {
		expect(parseStoredMultiselect(['[[Axe]]', '[[Mail]]'])).toEqual(['[[Axe]]', '[[Mail]]']);
		expect(parseStoredMultiselect(null)).toEqual([]);
	});
});

describe('formatMultiselectFrontmatterLine', () => {
	it('writes a yaml list', () => {
		const block = formatMultiselectFrontmatterLine('gear', ['[[Axe]]', '[[Mail]]']);
		expect(block).toBe('gear:\n  - "[[Axe]]"\n  - "[[Mail]]"');
	});
});