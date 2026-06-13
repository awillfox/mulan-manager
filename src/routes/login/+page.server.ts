import { fail, redirect, type Actions } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { setSession } from '$lib/server/session';

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const password = String(form.get('password') ?? '');
		if (!username || !password) {
			return fail(400, { error: 'Username and password are required.', username });
		}
		const res = await callBackend('api/auth/login', {
			method: 'POST',
			json: { username, password }
		});
		const payload = await res.json().catch(() => ({}));
		if (!res.ok) {
			return fail(res.status === 401 ? 401 : 500, {
				error: res.status === 401 ? 'Incorrect username or password.' : 'Login failed.',
				username
			});
		}
		setSession(cookies, payload.data.token);
		// Only allow same-origin, absolute-path redirects. Reject protocol-relative
		// (`//evil.com`) and backslash (`/\evil.com`) targets — open-redirect vectors.
		const next = url.searchParams.get('next') ?? '/';
		const dest =
			next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
		throw redirect(303, dest);
	}
};
