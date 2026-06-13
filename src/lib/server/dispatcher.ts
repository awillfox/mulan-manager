import { ProxyAgent } from 'undici';
import { env } from '$env/dynamic/private';

// In prod, tailscaled (userspace) exposes an HTTP proxy and our only outbound
// route to the backend is through it. In dev TS_HTTP_PROXY is empty → direct.
// Scoped as a per-request dispatcher (NOT setGlobalDispatcher) so only backend
// calls are tunneled.
export const backendDispatcher = env.TS_HTTP_PROXY
	? new ProxyAgent(env.TS_HTTP_PROXY)
	: undefined;
