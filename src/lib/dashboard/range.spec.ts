import { describe, it, expect } from 'vitest';
import { presetRange } from './range';

describe('presetRange', () => {
	const today = new Date(2026, 5, 14); // local 2026-06-14 (month is 0-indexed)

	it('today = single inclusive day', () => {
		expect(presetRange('today', today)).toEqual({ from: '2026-06-14', to: '2026-06-14' });
	});
	it('7d = 7 inclusive days', () => {
		expect(presetRange('7d', today)).toEqual({ from: '2026-06-08', to: '2026-06-14' });
	});
	it('30d = 30 inclusive days', () => {
		expect(presetRange('30d', today)).toEqual({ from: '2026-05-16', to: '2026-06-14' });
	});
	it('90d = 90 inclusive days', () => {
		expect(presetRange('90d', today)).toEqual({ from: '2026-03-17', to: '2026-06-14' });
	});
});
