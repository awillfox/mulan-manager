import { describe, it, expect } from 'vitest';
import { presetRange, customRange } from './range';

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

describe('customRange', () => {
	it('passes a valid range through unchanged', () => {
		expect(customRange('2026-06-01', '2026-06-14')).toEqual({
			from: '2026-06-01',
			to: '2026-06-14'
		});
	});
	it('accepts a single day', () => {
		expect(customRange('2026-06-14', '2026-06-14')).toEqual({
			from: '2026-06-14',
			to: '2026-06-14'
		});
	});
	it('rejects an empty from', () => {
		expect(customRange('', '2026-06-14')).toBeNull();
	});
	it('rejects an empty to', () => {
		expect(customRange('2026-06-01', '')).toBeNull();
	});
	it('rejects a reversed range', () => {
		expect(customRange('2026-06-14', '2026-06-01')).toBeNull();
	});
	it('accepts exactly 366 inclusive days', () => {
		// 2025-08-02..2026-08-02 inclusive = 366 days.
		expect(customRange('2025-08-02', '2026-08-02')).toEqual({
			from: '2025-08-02',
			to: '2026-08-02'
		});
	});
	it('rejects 367 inclusive days', () => {
		expect(customRange('2025-08-02', '2026-08-03')).toBeNull();
	});
	it('rejects a malformed date string', () => {
		expect(customRange('not-a-date', '2026-08-01')).toBeNull();
	});
});
