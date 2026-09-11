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
	'settings',
	'display'
];

// display/img/<file> is the one allowed path that is NOT a /api/* route on
// the backend: main.go registers ServeImage at the top level
// (`r.Get("/display/img/{filename}", displayHandler.ServeImage)`, outside
// `r.Route("/api", ...)`) so the unauthenticated kiosk display can fetch
// image bytes without going through /api at all. Every other allowed path
// (display/playlist, display/images, display/promos, ...) is a genuine
// /api/* route. So this one prefix must be forwarded WITHOUT the leading
// `api/` that every other path gets — see backendPath below.
const IMG_PREFIX = 'display/img/';

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
	const backendPath = path.startsWith(IMG_PREFIX)
		? `${path}${url.search}`
		: `api/${path}${url.search}`;

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
