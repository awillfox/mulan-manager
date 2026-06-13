import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { callBackend } from '$lib/server/backend';
import { getSessionToken, clearSession } from '$lib/server/session';
import type { ManagerUser } from './app.d';

// Routes reachable without a session.
const PUBLIC_PATHS = ['/login'];

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	const token = getSessionToken(event.cookies);

	if (token) {
		try {
			const res = await callBackend('api/auth/me', { token });
			if (res.ok) {
				const payload = await res.json();
				event.locals.user = payload.data as ManagerUser;
			} else if (res.status === 401) {
				clearSession(event.cookies); // stale/invalid token
			}
		} catch {
			// backend unreachable — treat as unauthenticated, page can show an error
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
	// The generic API proxy enforces its own auth; let it through.
	const isApi = path.startsWith('/api/');

	if (!event.locals.user && !isPublic && !isApi) {
		throw redirect(303, '/login?next=' + encodeURIComponent(path));
	}
	if (event.locals.user && path === '/login') {
		throw redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(handleParaglide, handleAuth);
