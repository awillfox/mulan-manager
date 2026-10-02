import { describe, it, expect } from 'vitest';
import { allowed } from './allow';

describe('allowed', () => {
	it('keeps existing prefixes', () => {
		expect(allowed('reports/orders?from=x')).toBe(true);
		expect(allowed('cash-drawer/denominations')).toBe(true);
	});
	it('allows only the void paths under orders', () => {
		expect(allowed('orders/void-reasons')).toBe(true);
		expect(allowed('orders/ABCD2345/void')).toBe(true);
		expect(allowed('orders/ABCD2345/void/preview')).toBe(true);
	});
	it('blocks every other orders path', () => {
		expect(allowed('orders')).toBe(false);
		expect(allowed('orders/ABCD2345/checkout')).toBe(false);
		expect(allowed('orders/ABCD2345/hold')).toBe(false);
		expect(allowed('orders/held')).toBe(false);
		expect(allowed('orders/AB/void/../checkout')).toBe(false);
		expect(allowed('orders/ABCD2345/void?x=1')).toBe(false);
	});
});
