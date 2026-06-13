import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const SESSION_COOKIE = 'mm_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches backend sessionTTL

export function setSession(cookies: Cookies, token: string) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

export function clearSession(cookies: Cookies) {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getSessionToken(cookies: Cookies): string | undefined {
	return cookies.get(SESSION_COOKIE);
}
