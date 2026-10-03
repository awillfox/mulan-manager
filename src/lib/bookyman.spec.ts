import { describe, it, expect } from 'vitest';
import { bookymanLoginUrl } from './bookyman';

describe('bookymanLoginUrl', () => {
	it('falls back to the on-prem tunnel host', () => {
		expect(bookymanLoginUrl()).toBe('https://bookyman.thgalleycafe.com/login');
	});
	it('appends the magic-link key', () => {
		expect(bookymanLoginUrl('https://x.test/login', 'abc123')).toBe(
			'https://x.test/login?key=abc123'
		);
	});
	it('omits the query entirely when no key is configured', () => {
		expect(bookymanLoginUrl('https://x.test/login', '')).toBe('https://x.test/login');
		expect(bookymanLoginUrl('https://x.test/login', undefined)).toBe('https://x.test/login');
	});
	it('strips a trailing slash so the query is not orphaned', () => {
		expect(bookymanLoginUrl('https://x.test/login/', 'k')).toBe('https://x.test/login?key=k');
	});
	it('url-encodes a key containing reserved characters', () => {
		expect(bookymanLoginUrl('https://x.test/login', 'a b&c=d')).toBe(
			'https://x.test/login?key=a%20b%26c%3Dd'
		);
	});
});
