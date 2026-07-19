import { describe, it, expect } from 'vitest';
import { ordersToRows } from './ordersRows';
import type { OrderRow } from '$lib/api/reports';

const sample: OrderRow = {
	code: 'AAA',
	status: 'paid',
	created_at: '2026-06-14T15:13:40+07:00',
	paid_at: '2026-06-14T15:16:40+07:00',
	member_name: 'Cream',
	member_phone: '08',
	points_earned: 9,
	item_count: 2,
	qty: 3,
	gross: 90,
	discount: 20,
	subsidy: 0,
	net: 70,
	line_items: [],
	discounts: []
};

describe('ordersToRows', () => {
	it('maps an order to an export row', () => {
		const rows = ordersToRows([sample]);
		expect(rows).toHaveLength(1);
		const r = rows[0];
		expect(r.code).toBe('AAA');
		expect(r.status).toBe('paid');
		expect(r.member).toBe('Cream');
		expect(r.phone).toBe('08');
		expect(r.points).toBe(9);
		expect(r.items).toBe(3);
		expect(r.gross).toBe(90);
		expect(r.discount).toBe(20);
		expect(r.subsidy).toBe(0);
		expect(r.net).toBe(70);
		expect(r.date instanceof Date).toBe(true);
		expect(r.date.getTime()).toBe(new Date('2026-06-14T15:13:40+07:00').getTime());
		expect(r.paidAt instanceof Date).toBe(true);
		expect(r.paidAt?.getTime()).toBe(new Date('2026-06-14T15:16:40+07:00').getTime());
	});
	it('maps a null paid_at to null', () => {
		const r = ordersToRows([{ ...sample, paid_at: null }])[0];
		expect(r.paidAt).toBeNull();
	});
	it('maps an empty list to no rows', () => {
		expect(ordersToRows([])).toEqual([]);
	});
});
