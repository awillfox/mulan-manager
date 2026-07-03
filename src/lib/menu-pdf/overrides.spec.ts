import { describe, it, expect } from 'vitest';
import { partialRows, movePrice, applyOverrides, type Overrides } from './overrides';
import type { MenuSheet } from './model';

const sheet: MenuSheet = {
	sections: [
		{
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [
				{ id: 1, name: 'Espresso', prices: [75, 90, 105], single: null },
				{ id: 2, name: 'Latte', prices: [80, 95, null], single: null },
				{ id: 3, name: 'Flat Coffee', prices: [null, null, null], single: 110 }
			]
		},
		{
			title: 'Italian Soda',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [{ id: 4, name: 'Blue Raspberry', prices: [null, 75, null], single: null }]
		},
		{
			title: 'Food',
			columns: [],
			rows: [{ id: 5, name: 'Pancake', prices: [], single: 80 }]
		}
	]
};

describe('partialRows', () => {
	it('includes partial variant rows and flat-priced items in a variant section', () => {
		expect(partialRows(sheet).map((r) => r.name)).toEqual([
			'Latte',
			'Flat Coffee',
			'Blue Raspberry'
		]);
	});
	it('keys rows by menu id', () => {
		expect(partialRows(sheet).map((r) => r.key)).toEqual([2, 3, 4]);
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
	it('replaces prices for the row with that menu id, leaving the rest untouched', () => {
		const overrides: Overrides = { 4: [75, null, null] };
		const result = applyOverrides(sheet, overrides);
		expect(result.sections[1].rows[0].prices).toEqual([75, null, null]);
		expect(result.sections[0].rows[0].prices).toEqual([75, 90, 105]);
		expect(result.sections[2].rows[0].single).toBe(80);
	});
	it('returns the sheet structure unchanged when there are no overrides', () => {
		const result = applyOverrides(sheet, {});
		expect(result.sections.map((s) => s.title)).toEqual(['Coffee', 'Italian Soda', 'Food']);
	});
});
