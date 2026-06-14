import { describe, it, expect } from 'vitest';
import { ordersQS } from './reports';

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
		expect(ordersQS({ from: '2026-06-08', to: '2026-06-14', status: 'paid' })).toContain('status=paid');
	});
});
