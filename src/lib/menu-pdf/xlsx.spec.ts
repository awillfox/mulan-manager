import { describe, it, expect } from 'vitest';
import { buildRows, sheetNames } from './xlsx';
import type { SheetSection } from './model';

describe('buildRows', () => {
	it('builds a Name/Price table for a plain section', () => {
		const s: SheetSection = {
			title: 'Food',
			columns: [],
			rows: [
				{ id: 1, name: 'Toast', prices: [], single: 45 },
				{ id: 2, name: 'Free', prices: [], single: null }
			]
		};
		expect(buildRows(s)).toEqual([
			[
				{ value: 'Name', type: String },
				{ value: 'Price', type: String }
			],
			[
				{ value: 'Toast', type: String },
				{ value: 45, type: Number }
			],
			[{ value: 'Free', type: String }, null]
		]);
	});

	it('builds a Name + variant-columns table, using display labels', () => {
		const s: SheetSection = {
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappe'],
			rows: [{ id: 1, name: 'Latte', prices: [55, 60, 70], single: null }]
		};
		expect(buildRows(s)).toEqual([
			[
				{ value: 'Name', type: String },
				{ value: 'Hot', type: String },
				{ value: 'Iced', type: String },
				{ value: 'Frappé', type: String }
			],
			[
				{ value: 'Latte', type: String },
				{ value: 55, type: Number },
				{ value: 60, type: Number },
				{ value: 70, type: Number }
			]
		]);
	});

	it('leaves absent variant prices as empty cells', () => {
		const s: SheetSection = {
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappe'],
			rows: [{ id: 1, name: 'Americano', prices: [45, 50, null], single: null }]
		};
		expect(buildRows(s)[1]).toEqual([
			{ value: 'Americano', type: String },
			{ value: 45, type: Number },
			{ value: 50, type: Number },
			null
		]);
	});

	it('places an unplaced flat price in the first variant column', () => {
		const s: SheetSection = {
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappe'],
			rows: [{ id: 1, name: 'Espresso', prices: [null, null, null], single: 40 }]
		};
		expect(buildRows(s)[1]).toEqual([
			{ value: 'Espresso', type: String },
			{ value: 40, type: Number },
			null,
			null
		]);
	});
});

describe('sheetNames', () => {
	const sec = (title: string): SheetSection => ({ title, columns: [], rows: [] });

	it('strips characters Excel forbids in tab names', () => {
		expect(sheetNames([sec('Hot / Iced [drinks]')])).toEqual(['Hot  Iced drinks']);
	});

	it('truncates to 31 characters', () => {
		expect(sheetNames([sec('x'.repeat(40))][0] ? [sec('x'.repeat(40))] : [])).toEqual([
			'x'.repeat(31)
		]);
	});

	it('de-duplicates case-insensitive collisions', () => {
		expect(sheetNames([sec('Coffee'), sec('coffee'), sec('Coffee')])).toEqual([
			'Coffee',
			'coffee (2)',
			'Coffee (3)'
		]);
	});

	it('falls back to Sheet for an empty name', () => {
		expect(sheetNames([sec('   ')])).toEqual(['Sheet']);
	});
});
