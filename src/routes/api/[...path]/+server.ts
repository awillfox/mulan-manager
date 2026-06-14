import { error, type RequestHandler } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { getSessionToken } from '$lib/server/session';

// Allowlisted backend path prefixes the browser may reach via this proxy.
// NOT an open tunnel onto the tailnet — only these manager surfaces.
const ALLOW = [
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
	'settings'
];

function allowed(path: string): boolean {
	return ALLOW.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'));
}

const handler: RequestHandler = async ({ params, request, url, cookies }) => {
	const path = params.path ?? '';
	if (!allowed(path)) throw error(404, 'not found');

	const token = getSessionToken(cookies);
	if (!token) throw error(401, 'not authenticated');

	const method = request.method;
	const hasBody = method !== 'GET' && method !== 'HEAD';
	const backendPath = `api/${path}${url.search}`;

	const res = await callBackend(backendPath, {
		method,
		token,
		// Read as ArrayBuffer (binary-safe). request.text() would UTF-8-decode and
		// corrupt non-text bodies — e.g. multipart logo uploads. The original
		// content-type (incl. the multipart boundary) is forwarded below.
		body: hasBody ? await request.arrayBuffer() : null,
		headers: hasBody
			? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }
			: {}
	});

	// Stream the backend response straight back (covers JSON and SSE).
	return new Response(res.body, {
		status: res.status,
		headers: {
			'Content-Type': res.headers.get('content-type') ?? 'application/json',
			'Cache-Control': res.headers.get('cache-control') ?? 'no-store'
		}
	});
};

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
