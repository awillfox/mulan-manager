import { describe, it, expect } from 'vitest';
import { partialRows, movePrice, applyOverrides, rowKey, type Overrides } from './overrides';
import type { MenuSheet } from './model';

const sheet: MenuSheet = {
	sections: [
		{
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [
				{ name: 'Espresso', prices: [75, 90, 105], single: null }, // fully assigned
				{ name: 'Latte', prices: [80, 95, null], single: null }, // partial (2 of 3)
				{ name: 'Flat Coffee', prices: [null, null, null], single: 110 } // single-price fallback
			]
		},
		{
			title: 'Italian Soda',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [
				{ name: 'Blue Raspberry', prices: [null, 75, null], single: null } // partial (1 of 3)
			]
		},
		{
			title: 'Food',
			columns: [],
			rows: [{ name: 'Pancake', prices: [], single: 80 }] // non-variant section
		}
	]
};

describe('partialRows', () => {
	it('includes partial variant rows and flat-priced items in a variant section', () => {
		const rows = partialRows(sheet);
		// Latte (2 of 3), Flat Coffee (flat price in a variant section), Blue Raspberry (1 of 3).
		// Espresso (fully assigned) and Pancake (non-variant section) are excluded.
		expect(rows.map((r) => r.name)).toEqual(['Latte', 'Flat Coffee', 'Blue Raspberry']);
	});
	it('keys rows by section and row index', () => {
		const rows = partialRows(sheet);
		expect(rows[0].key).toBe(rowKey(0, 1)); // Coffee, Latte
		expect(rows[1].key).toBe(rowKey(0, 2)); // Coffee, Flat Coffee
		expect(rows[2].key).toBe(rowKey(1, 0)); // Italian Soda, Blue Raspberry
	});
	it('carries the flat single price for an unassigned item', () => {
		const dirty = partialRows(sheet).find((r) => r.name === 'Flat Coffee')!;
		expect(dirty.prices).toEqual([null, null, null]);
		expect(dirty.single).toBe(110);
	});
});

describe('movePrice', () => {
	it('moves a price into an adjacent empty column', () => {
		expect(movePrice([null, 75, null], 1, 2)).toEqual([null, null, 75]);
		expect(movePrice([null, 75, null], 1, 0)).toEqual([75, null, null]);
	});
	it('is a no-op when the target is already filled', () => {
		expect(movePrice([80, 95, null], 1, 0)).toEqual([80, 95, null]);
	});
	it('is a no-op when the source is empty', () => {
		expect(movePrice([null, 75, null], 0, 2)).toEqual([null, 75, null]);
	});
	it('is safe for out-of-range indices and returns a fresh array', () => {
		const input = [null, 75, null];
		const result = movePrice(input, 1, 9);
		expect(result).toEqual([null, 75, null]);
		expect(result).not.toBe(input);
	});
});

describe('applyOverrides', () => {
	it('replaces prices only for keyed rows, leaving the rest untouched', () => {
		const overrides: Overrides = { [rowKey(1, 0)]: [75, null, null] };
		const result = applyOverrides(sheet, overrides);
		expect(result.sections[1].rows[0].prices).toEqual([75, null, null]);
		// unrelated rows unchanged
		expect(result.sections[0].rows[0].prices).toEqual([75, 90, 105]);
		expect(result.sections[2].rows[0].single).toBe(80);
	});
	it('returns the sheet structure unchanged when there are no overrides', () => {
		const result = applyOverrides(sheet, {});
		expect(result.sections.map((s) => s.title)).toEqual(['Coffee', 'Italian Soda', 'Food']);
	});
});
