// Link to the bookyman-remote music player.
//
// bookyman-remote accepts a magic-link login at `GET /login?key=<password>`,
// so the key necessarily rides in the query string and IS visible to anyone who
// can load this page. The manager app's own login is the real gate; the key is
// shared-password convenience, not a secret. Kept pure (no `$env` import) so it
// stays unit-testable — callers pass the PUBLIC_ vars in.
const DEFAULT_URL = 'https://bookyman.thgalleycafe.com/login';

export function bookymanLoginUrl(base?: string, key?: string): string {
	const url = (base || DEFAULT_URL).replace(/\/+$/, '');
	if (!key) return url;
	return `${url}?key=${encodeURIComponent(key)}`;
}
