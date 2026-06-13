import { describe, it, expect } from 'vitest';
import { SELECTION_MODES, isSelectionMode } from './optionGroups';

describe('option group selection modes', () => {
	it('lists the three modes', () => {
		expect(SELECTION_MODES.map((m) => m.value)).toEqual([
			'single_required',
			'single_optional',
			'multi'
		]);
	});
	it('validates a mode', () => {
		expect(isSelectionMode('multi')).toBe(true);
		expect(isSelectionMode('nope')).toBe(false);
	});
});
