import { describe, it, expect } from 'vitest';
import { buildBackendUrl } from './backend';

describe('buildBackendUrl', () => {
	it('joins base + path', () => {
		expect(buildBackendUrl('http://host:8080', 'api/discounts', '')).toBe(
			'http://host:8080/api/discounts'
		);
	});
	it('preserves a query string', () => {
		expect(buildBackendUrl('http://host:8080', 'api/dashboard/', 'from=2026-01-01')).toBe(
			'http://host:8080/api/dashboard/?from=2026-01-01'
		);
	});
	it('strips trailing slash on base and leading slash on path', () => {
		expect(buildBackendUrl('http://host:8080/', '/api/auth/me', '')).toBe(
			'http://host:8080/api/auth/me'
		);
	});
});
