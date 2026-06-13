import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { callBackend } from '$lib/server/backend';

// TEMPORARY diagnostic — surfaces why the proxied backend fetch fails on render.
// Remove after debugging the Tailscale proxy path.
export const GET = async () => {
	const info: Record<string, unknown> = {
		backend_url: env.BACKEND_URL,
		ts_http_proxy: env.TS_HTTP_PROXY
	};
	try {
		const res = await callBackend('api/discounts/active');
		info.ok = true;
		info.status = res.status;
	} catch (e) {
		const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string; errors?: unknown } };
		info.ok = false;
		info.name = err?.name;
		info.message = err?.message;
		info.cause_code = err?.cause?.code;
		info.cause_message = err?.cause?.message;
		info.cause = String(err?.cause);
	}
	return json(info);
};
