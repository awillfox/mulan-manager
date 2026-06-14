import { describe, it, expect } from 'vitest';
import { baht } from './format';

describe('baht', () => {
	it('formats THB with symbol and 2 decimals', () => {
		expect(baht(1518)).toBe('฿1,518.00');
	});
	it('treats 0 and NaN as ฿0.00', () => {
		expect(baht(0)).toBe('฿0.00');
		expect(baht(Number.NaN)).toBe('฿0.00');
	});
});
