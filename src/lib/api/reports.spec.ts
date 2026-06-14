import { describe, it, expect, afterEach, vi } from 'vitest';
import { ordersQS } from './reports';
import { listAllOrders } from './reports';
import type { OrderRow } from './reports';

describe('ordersQS', () => {
	it('includes from/to and pagination', () => {
		expect(ordersQS({ from: '2026-06-08', to: '2026-06-14', limit: 100, offset: 0 })).toBe(
			'from=2026-06-08&to=2026-06-14&limit=100&offset=0'
		);
	});
	it('omits status when empty (All)', () => {
		const qs = ordersQS({ from: '2026-06-08', to: '2026-06-14' });
		expect(qs).toBe('from=2026-06-08&to=2026-06-14');
	});
	it('includes status when set', () => {
		expect(ordersQS({ from: '2026-06-08', to: '2026-06-14', status: 'paid' })).toContain(
			'status=paid'
		);
	});
});

function mk(code: string): OrderRow {
	return {
		code,
		status: 'paid',
		created_at: '',
		member_name: '',
		member_phone: '',
		points_earned: 0,
		item_count: 0,
		qty: 0,
		gross: 0,
		discount: 0,
		subsidy: 0,
		net: 0,
		line_items: [],
		discounts: []
	};
}

function mockPages(pages: { orders: OrderRow[]; total: number }[]) {
	let call = 0;
	globalThis.fetch = vi.fn(async () => ({
		ok: true,
		json: async () => ({ data: pages[call++] })
	})) as unknown as typeof fetch;
}

describe('listAllOrders', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('accumulates all pages until total is reached', async () => {
		mockPages([
			{ orders: [mk('a'), mk('b')], total: 3 },
			{ orders: [mk('c')], total: 3 }
		]);
		const all = await listAllOrders({ from: '2026-06-01', to: '2026-06-14' });
		expect(all.map((o) => o.code)).toEqual(['a', 'b', 'c']);
	});

	it('stops when a page returns empty (guards infinite loop)', async () => {
		mockPages([{ orders: [], total: 5 }]);
		const all = await listAllOrders({ from: '2026-06-01', to: '2026-06-14' });
		expect(all).toEqual([]);
	});
});
