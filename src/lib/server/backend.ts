import { env } from '$env/dynamic/private';
import { backendDispatcher } from './dispatcher';

export function buildBackendUrl(base: string, path: string, query: string): string {
	const b = base.replace(/\/+$/, '');
	const p = path.replace(/^\/+/, '');
	return query ? `${b}/${p}?${query}` : `${b}/${p}`;
}

export interface BackendCallOptions {
	method?: string;
	/** Raw bearer token to forward (from the session cookie). */
	token?: string;
	/** JSON body — serialized automatically. */
	json?: unknown;
	/** Pass-through body (used by the generic proxy). */
	body?: BodyInit | null;
	headers?: Record<string, string>;
}

// callBackend performs a single server-side request to the Go backend, tunneled
// through the Tailscale dispatcher when configured.
export async function callBackend(path: string, opts: BackendCallOptions = {}): Promise<Response> {
	const url = buildBackendUrl(env.BACKEND_URL ?? 'http://localhost:8080', path, '');
	const headers: Record<string, string> = { ...opts.headers };
	if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
	let body = opts.body ?? null;
	if (opts.json !== undefined) {
		headers['Content-Type'] = 'application/json';
		body = JSON.stringify(opts.json);
	}
	return fetch(url, {
		method: opts.method ?? 'GET',
		headers,
		body,
		// @ts-expect-error undici-only option on Node's global fetch
		dispatcher: backendDispatcher
	});
}

/** Convenience: call backend, parse the {data,error} envelope, throw on !ok. */
export async function callBackendJson<T>(path: string, opts: BackendCallOptions = {}): Promise<T> {
	const res = await callBackend(path, opts);
	const payload = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(payload?.error || `backend ${res.status}`);
	}
	return payload.data as T;
}
