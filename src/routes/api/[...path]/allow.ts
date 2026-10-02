// Allowlisted backend path prefixes the browser may reach via this proxy.
// NOT an open tunnel onto the tailnet — only these manager surfaces.
export const ALLOW = [
	'discounts',
	'dashboard',
	'auth/me',
	'auth/logout',
	'auth/change-password',
	'menus',
	'menu-categories',
	'option-groups',
	'options',
	'members',
	'reports',
	'cashiers',
	'cash-drawer',
	'settings',
	'display'
];

// /api/orders is the POS's open checkout/hold surface, so it is NOT a prefix
// above. Only the manager void endpoints are exposed, matched exactly: an
// order code is uppercase alphanumerics, and no query string is accepted.
const ORDER_PATHS = [/^orders\/void-reasons$/, /^orders\/[A-Z0-9]{1,20}\/void(\/preview)?$/];

export function allowed(path: string): boolean {
	if (ORDER_PATHS.some((re) => re.test(path))) return true;
	return ALLOW.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
}
