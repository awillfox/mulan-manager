import { describe, it, expect } from 'vitest';
import { deltaPct, deltaLabel } from './delta';

describe('deltaPct', () => {
	it('computes percent change', () => {
		expect(deltaPct(150, 100)).toBe(50);
	});
	it('returns null when previous is 0', () => {
		expect(deltaPct(150, 0)).toBeNull();
	});
});

describe('deltaLabel', () => {
	it('formats an increase', () => {
		expect(deltaLabel(50)).toBe('▲ 50%');
	});
	it('formats a decrease', () => {
		expect(deltaLabel(-25)).toBe('▼ 25%');
	});
	it('says "no prior" for null', () => {
		expect(deltaLabel(null)).toBe('no prior');
	});
});
