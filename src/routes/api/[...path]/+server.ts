import { error, type RequestHandler } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { getSessionToken } from '$lib/server/session';
import { allowed } from './allow';

// display/img/<file> is the one allowed path that is NOT a /api/* route on
// the backend: main.go registers ServeImage at the top level
// (`r.Get("/display/img/{filename}", displayHandler.ServeImage)`, outside
// `r.Route("/api", ...)`) so the unauthenticated kiosk display can fetch
// image bytes without going through /api at all. Every other allowed path
// (display/playlist, display/images, display/promos, ...) is a genuine
// /api/* route. So this one prefix must be forwarded WITHOUT the leading
// `api/` that every other path gets — see backendPath below.
const IMG_PREFIX = 'display/img/';

const handler: RequestHandler = async ({ params, request, url, cookies }) => {
	const path = params.path ?? '';
	if (!allowed(path)) throw error(404, 'not found');

	const token = getSessionToken(cookies);
	if (!token) throw error(401, 'not authenticated');

	const method = request.method;
	const hasBody = method !== 'GET' && method !== 'HEAD';
	const isImageFetch = path.startsWith(IMG_PREFIX);
	const backendPath = isImageFetch ? `${path}${url.search}` : `api/${path}${url.search}`;

	const res = await callBackend(backendPath, {
		method,
		// ServeImage is deliberately unauthenticated (see IMG_PREFIX above) —
		// don't forward the owner's session bearer to it. Requiring a valid
		// session to reach it at all (the check above) is enough; sending the
		// live token to an endpoint that was never meant to see one is a
		// credential crossing a boundary drawn on purpose, for no benefit.
		token: isImageFetch ? undefined : token,
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
