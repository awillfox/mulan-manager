import { describe, it, expect } from 'vitest';
import { buildMenuSheet } from './model';
import type { Menu } from '$lib/api/menus';
import type { Category } from '$lib/api/categories';

function menu(p: Partial<Menu>): Menu {
	return {
		id: 1,
		name: 'X',
		price: 0,
		category_id: null,
		vfd_name: '',
		active: true,
		favourite: false,
		option_groups: [],
		base_options: [],
		...p
	};
}

const cats: Category[] = [
	{ id: 10, name: 'Coffee' },
	{ id: 20, name: 'Food' },
	{ id: 30, name: 'Empty' }
];

describe('buildMenuSheet', () => {
	it('drops inactive items', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'On', price: 50, category_id: 20, active: true }),
				menu({ id: 2, name: 'Off', price: 60, category_id: 20, active: false })
			],
			cats
		);
		const food = sheet.sections.find((s) => s.title === 'Food')!;
		expect(food.rows.map((r) => r.name)).toEqual(['On']);
	});

	it('groups by category in category order and drops empty categories', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Pancake', price: 80, category_id: 20 }),
				menu({ id: 2, name: 'Latte', price: 80, category_id: 10 })
			],
			cats
		);
		expect(sheet.sections.map((s) => s.title)).toEqual(['Coffee', 'Food']);
	});

	it('puts uncategorised items in an "Other" section at the end', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Latte', price: 80, category_id: 10 }),
				menu({ id: 2, name: 'Mystery', price: 20, category_id: null })
			],
			cats
		);
		expect(sheet.sections.map((s) => s.title)).toEqual(['Coffee', 'Other']);
	});

	it('builds variant columns as the union of base_option names in first-appearance order', () => {
		const sheet = buildMenuSheet(
			[
				menu({
					id: 1,
					name: 'Americano',
					category_id: 10,
					base_options: [
						{ name: 'Hot', price: 75 },
						{ name: 'Iced', price: 85 }
					]
				}),
				menu({
					id: 2,
					name: 'Espresso',
					category_id: 10,
					base_options: [
						{ name: 'Hot', price: 75 },
						{ name: 'Iced', price: 90 },
						{ name: 'Frappé', price: 105 }
					]
				})
			],
			cats
		);
		const coffee = sheet.sections[0];
		expect(coffee.columns).toEqual(['Hot', 'Iced', 'Frappé']);
		expect(coffee.rows[0]).toEqual({ name: 'Americano', prices: [75, 85, null], single: null });
		expect(coffee.rows[1]).toEqual({ name: 'Espresso', prices: [75, 90, 105], single: null });
	});

	it('renders a plain single-price section when no item has base_options', () => {
		const sheet = buildMenuSheet(
			[menu({ id: 1, name: 'Pancake', price: 80, category_id: 20 })],
			cats
		);
		const food = sheet.sections[0];
		expect(food.columns).toEqual([]);
		expect(food.rows[0]).toEqual({ name: 'Pancake', prices: [], single: 80 });
	});

	it('keeps a single price for an item with no variants inside a variant section', () => {
		const sheet = buildMenuSheet(
			[
				menu({
					id: 1,
					name: 'Americano',
					category_id: 10,
					base_options: [{ name: 'Hot', price: 75 }]
				}),
				menu({ id: 2, name: 'Flat Coffee', price: 110, category_id: 10, base_options: [] })
			],
			cats
		);
		const coffee = sheet.sections[0];
		expect(coffee.columns).toEqual(['Hot']);
		expect(coffee.rows[1]).toEqual({ name: 'Flat Coffee', prices: [null], single: 110 });
	});

	it('shares one global column set across sections so variants align', () => {
		const soda: Category[] = [
			{ id: 10, name: 'Coffee' },
			{ id: 40, name: 'Italian Soda' }
		];
		const sheet = buildMenuSheet(
			[
				menu({
					id: 1,
					name: 'Espresso',
					category_id: 10,
					base_options: [
						{ name: 'Hot', price: 75 },
						{ name: 'Iced', price: 90 },
						{ name: 'Frappé', price: 105 }
					]
				}),
				// Italian Soda only serves Iced — it should still use the full
				// Hot/Iced/Frappé grid, with the Iced price in the middle column.
				menu({
					id: 2,
					name: 'Blue Raspberry',
					category_id: 40,
					base_options: [{ name: 'Iced', price: 75 }]
				})
			],
			soda
		);
		const italianSoda = sheet.sections.find((s) => s.title === 'Italian Soda')!;
		expect(italianSoda.columns).toEqual(['Hot', 'Iced', 'Frappé']);
		expect(italianSoda.rows[0]).toEqual({
			name: 'Blue Raspberry',
			prices: [null, 75, null],
			single: null
		});
	});
});
