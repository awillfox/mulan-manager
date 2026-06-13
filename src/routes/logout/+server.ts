import { redirect, type RequestHandler } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { getSessionToken, clearSession } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = getSessionToken(cookies);
	if (token) {
		try {
			await callBackend('api/auth/logout', { method: 'POST', token });
		} catch {
			// best-effort revoke; clear the cookie regardless
		}
	}
	clearSession(cookies);
	throw redirect(303, '/login');
};
