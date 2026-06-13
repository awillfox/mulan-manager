# mulan-manager Frontend Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> REQUIRED VISUAL SUB-SKILLS for every component/page task: invoke `frontend-design` for the iOS visual quality bar, and run the Svelte MCP `svelte-autofixer` on each `.svelte` file until it returns no issues (project rule in CLAUDE.md). Do NOT request a playground link (code is written to files).

**Goal:** Ship the iOS-style manager vertical slice — login → dashboard → discounts CRUD — as a SvelteKit app on render, talking to the private Go `mulan` backend over a Tailscale server-side proxy, using the bearer auth from plan `2026-06-13-managerauth-backend.md`.

**Architecture:** Browser is same-origin to render. A SvelteKit server proxy route `/api/[...path]` forwards browser calls to the backend over a Tailscale userspace HTTP proxy (per-request `undici` `ProxyAgent` dispatcher), injecting the bearer from an httpOnly cookie. `hooks.server.ts` resolves the session and guards routes. iOS component library + three pages built to Apple HIG. Ships as a Dockerfile that runs `tailscaled` (userspace) alongside the Node server.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), `@sveltejs/adapter-node`, Tailwind v4, paraglide (en/th-th), `undici`, Playwright, Vitest, Tailscale, render.com Docker.

**Working directory for ALL tasks:** `/home/nate/Dev/mulan-manager`.

**Dependency:** the backend plan must be implemented first (login + `/api/auth/*` + protected `/api/discounts` + `/api/dashboard` must exist). Local dev runs the Go backend on `localhost:8080`.

**Backend contract (verified, do not re-derive):**
- Envelope: every response is `{ "data": <payload>, "error"?: "<msg>" }`.
- `POST /api/auth/login` `{username,password}` → `{data:{token, expires_at, user:{id,username,name,role}}}` | 401.
- `POST /api/auth/logout` (Bearer) → 204. `GET /api/auth/me` (Bearer) → `{data:{id,username,name,role}}`.
- `GET /api/dashboard/` (Bearer) → `{data:{sales:number, orders:number}}` (today).
- `GET /api/dashboard/top-menus` (Bearer) → `{data:[{name,qty_sold,revenue}]}`.
- `GET /api/discounts` (Bearer) → `{data:[{id,name,discount_type:"fixed"|"percent",value:number,active:bool,is_subsidy:bool}]}`. `value` is already THB (fixed) or percent (percent).
- `POST /api/discounts` (Bearer) `{name,discount_type,value,active,is_subsidy}` → 201 `{data:<discount>}`.
- `PATCH /api/discounts/{id}` (Bearer) same body → 200. `DELETE /api/discounts/{id}` (Bearer) → 204.

---

### Task 1: Deps, adapter swap, env scaffolding

**Files:**
- Modify: `package.json` (add deps)
- Modify: `svelte.config.js`
- Create: `.env.example`, `.env` (dev, gitignored)

- [ ] **Step 1: Install adapter-node + undici**

Run: `npm i -D @sveltejs/adapter-node && npm i undici`
Expected: both added, `npm ls @sveltejs/adapter-node undici` shows versions.

- [ ] **Step 2: Switch the adapter**

In `svelte.config.js`, replace the `adapter-auto` import and usage with adapter-node:

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
	preprocess: vitePreprocess(),
	kit: { adapter: adapter() }
};

export default config;
```

- [ ] **Step 3: Create `.env.example`**

```bash
# Backend base URL (NO trailing slash). Dev: local Go server. Prod: tailnet MagicDNS host.
BACKEND_URL=http://localhost:8080
# Tailscale userspace HTTP proxy. Empty in dev (direct). Prod: http://127.0.0.1:1055
TS_HTTP_PROXY=
# Tailscale auth key (prod/render only; ephemeral + tagged). Empty in dev.
TS_AUTHKEY=
```

- [ ] **Step 4: Create local `.env` (gitignored already)**

```bash
BACKEND_URL=http://localhost:8080
TS_HTTP_PROXY=
TS_AUTHKEY=
```

- [ ] **Step 5: Build to confirm the adapter resolves**

Run: `npm run build`
Expected: build succeeds, output mentions adapter-node (a `build/` dir is produced).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json svelte.config.js .env.example
git commit -m "chore: adapter-node + undici + env scaffolding"
```

---

### Task 2: Backend fetch helper + Tailscale dispatcher

**Files:**
- Create: `src/lib/server/dispatcher.ts`
- Create: `src/lib/server/backend.ts`
- Test: `src/lib/server/backend.spec.ts`

- [ ] **Step 1: Write the dispatcher**

Create `src/lib/server/dispatcher.ts`:

```ts
import { ProxyAgent } from 'undici';
import { env } from '$env/dynamic/private';

// In prod, tailscaled (userspace) exposes an HTTP proxy and our only outbound
// route to the backend is through it. In dev TS_HTTP_PROXY is empty → direct.
// Scoped as a per-request dispatcher (NOT setGlobalDispatcher) so only backend
// calls are tunneled.
export const backendDispatcher = env.TS_HTTP_PROXY
	? new ProxyAgent(env.TS_HTTP_PROXY)
	: undefined;
```

- [ ] **Step 2: Write the failing test for URL building**

Create `src/lib/server/backend.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBackendUrl } from './backend';

describe('buildBackendUrl', () => {
	it('joins base + path', () => {
		expect(buildBackendUrl('http://host:8080', 'api/discounts', '')).toBe(
			'http://host:8080/api/discounts'
		);
	});
	it('preserves a query string', () => {
		expect(buildBackendUrl('http://host:8080', 'api/dashboard/', 'from=2026-01-01')).toBe(
			'http://host:8080/api/dashboard/?from=2026-01-01'
		);
	});
	it('strips trailing slash on base and leading slash on path', () => {
		expect(buildBackendUrl('http://host:8080/', '/api/auth/me', '')).toBe(
			'http://host:8080/api/auth/me'
		);
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:unit -- --run src/lib/server/backend.spec.ts`
Expected: FAIL — `buildBackendUrl` is not exported.

- [ ] **Step 4: Write the backend helper**

Create `src/lib/server/backend.ts`:

```ts
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
	/** Pass-through ReadableStream/string body (used by the generic proxy). */
	body?: BodyInit | null;
	headers?: Record<string, string>;
}

// callBackend performs a single server-side request to the Go backend, tunneled
// through the Tailscale dispatcher when configured. The `dispatcher` field is a
// Node/undici fetch extension; cast keeps TS happy.
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- --run src/lib/server/backend.spec.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/
git commit -m "feat: backend fetch helper + tailscale-scoped dispatcher"
```

---

### Task 3: Session cookie, types, and route-guarding hooks

**Files:**
- Create: `src/lib/server/session.ts`
- Modify: `src/app.d.ts`
- Modify: `src/hooks.server.ts`

- [ ] **Step 1: Write the session cookie helpers**

Create `src/lib/server/session.ts`:

```ts
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
```

- [ ] **Step 2: Type `locals` and the user**

Replace `src/app.d.ts` contents with:

```ts
export interface ManagerUser {
	id: number;
	username: string;
	name: string;
	role: 'owner' | 'staff';
}

declare global {
	namespace App {
		interface Locals {
			user: ManagerUser | null;
		}
	}
}

export {};
```

- [ ] **Step 3: Write the hooks (resolve session + guard)**

Replace `src/hooks.server.ts` contents with:

```ts
import { redirect, type Handle } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { getSessionToken, clearSession } from '$lib/server/session';
import type { ManagerUser } from './app.d';

// Routes reachable without a session.
const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
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
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: 0 errors (warnings about unused demo routes are fine; if `src/routes/demo` trips check, it is removed in Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/session.ts src/app.d.ts src/hooks.server.ts
git commit -m "feat: httpOnly session cookie + auth-resolving route guard"
```

---

### Task 4: Login + logout

**Files:**
- Create: `src/routes/login/+page.server.ts`
- Create: `src/routes/login/+page.svelte`
- Create: `src/routes/logout/+server.ts`

> The login form posts to a server action (not the generic proxy) because it must SET the cookie. Reuses iOS components built in Tasks 7–8; for now use minimal markup, then restyle in Task 11's polish pass if needed. To avoid a forward reference, this task uses plain elements and the page is visually finalized here with Tailwind.

- [ ] **Step 1: Write the login action**

Create `src/routes/login/+page.server.ts`:

```ts
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
		const next = url.searchParams.get('next') ?? '/';
		throw redirect(303, next.startsWith('/') ? next : '/');
	}
};
```

- [ ] **Step 2: Write the login page**

Create `src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	let { form } = $props();
	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-[var(--ios-grouped-bg)] px-6">
	<div class="w-full max-w-sm">
		<h1 class="mb-1 text-center text-3xl font-bold text-[var(--ios-label)]">Mulan Manager</h1>
		<p class="mb-8 text-center text-[var(--ios-label-secondary)]">Sign in to continue</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="space-y-4"
		>
			{#if form?.error}
				<p class="rounded-xl bg-[var(--ios-red-soft)] px-4 py-3 text-sm text-[var(--ios-red)]">
					{form.error}
				</p>
			{/if}
			<input
				name="username"
				autocomplete="username"
				placeholder="Username"
				value={form?.username ?? ''}
				class="h-12 w-full rounded-xl bg-[var(--ios-card)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
			/>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				placeholder="Password"
				class="h-12 w-full rounded-xl bg-[var(--ios-card)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
			/>
			<button
				type="submit"
				disabled={submitting}
				class="h-12 w-full rounded-xl bg-[var(--ios-blue)] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign In'}
			</button>
		</form>
	</div>
</div>
```

- [ ] **Step 3: Write the logout endpoint**

Create `src/routes/logout/+server.ts`:

```ts
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
```

- [ ] **Step 4: Run svelte-autofixer on the page**

Use Svelte MCP `svelte-autofixer` on `src/routes/login/+page.svelte`; apply fixes; repeat until clean.

- [ ] **Step 5: Manual verify (needs Go backend + a seeded user running on :8080)**

Run: `npm run dev` then open `http://localhost:5173/` → should redirect to `/login`. Sign in with the seeded owner creds. Expected: redirect to `/`, and the `mm_session` cookie is set (DevTools → Application → Cookies, httpOnly = true). Wrong password shows "Incorrect username or password."

- [ ] **Step 6: Commit**

```bash
git add src/routes/login/ src/routes/logout/
git commit -m "feat: manager login action + logout endpoint"
```

---

### Task 5: Generic API proxy `/api/[...path]`

**Files:**
- Create: `src/routes/api/[...path]/+server.ts`

- [ ] **Step 1: Write the proxy**

Create `src/routes/api/[...path]/+server.ts`:

```ts
import { error, type RequestHandler } from '@sveltejs/kit';
import { callBackend } from '$lib/server/backend';
import { getSessionToken } from '$lib/server/session';

// Allowlisted backend path prefixes the browser may reach via this proxy.
// NOT an open tunnel onto the tailnet — only these manager surfaces.
const ALLOW = ['discounts', 'dashboard', 'auth/me', 'auth/logout'];

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
		body: hasBody ? await request.text() : null,
		headers: hasBody ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' } : {}
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
```

- [ ] **Step 2: Manual verify the proxy (dev, logged in)**

With `npm run dev` running and a session cookie set, in the browser console on the app origin:
```js
fetch('/api/discounts').then(r => r.json()).then(console.log)
```
Expected: `{data:[...]}` from the backend (200). `fetch('/api/menus')` → 404 (not allowlisted). Logged out → 401.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/
git commit -m "feat: server-side API proxy with cookie->bearer + path allowlist"
```

---

### Task 6: iOS design tokens

**Files:**
- Create: `src/lib/styles/tokens.css`
- Modify: `src/routes/+layout.svelte` (import tokens; set font + theme baseline)

- [ ] **Step 1: Write the tokens**

Create `src/lib/styles/tokens.css`:

```css
/* iOS semantic color tokens (HIG system colors), light default + dark override.
   Components reference these via var(--ios-*). 8pt spacing is enforced via
   Tailwind's default scale (multiples of 4); use even steps (2,4,6,8...). */
:root {
	--ios-blue: #007aff;
	--ios-green: #34c759;
	--ios-red: #ff3b30;
	--ios-red-soft: rgba(255, 59, 48, 0.12);
	--ios-bg: #ffffff;
	--ios-grouped-bg: #f2f2f7;
	--ios-card: #ffffff;
	--ios-separator: rgba(60, 60, 67, 0.18);
	--ios-label: #000000;
	--ios-label-secondary: rgba(60, 60, 67, 0.6);
	--ios-label-tertiary: rgba(60, 60, 67, 0.3);
	--ios-fill: rgba(120, 120, 128, 0.12);
	--ios-nav-blur: rgba(249, 249, 249, 0.8);
}

@media (prefers-color-scheme: dark) {
	:root:not(.theme-light) {
		--ios-bg: #000000;
		--ios-grouped-bg: #000000;
		--ios-card: #1c1c1e;
		--ios-separator: rgba(84, 84, 88, 0.65);
		--ios-label: #ffffff;
		--ios-label-secondary: rgba(235, 235, 245, 0.6);
		--ios-label-tertiary: rgba(235, 235, 245, 0.3);
		--ios-fill: rgba(120, 120, 128, 0.24);
		--ios-nav-blur: rgba(30, 30, 30, 0.8);
	}
}

:global(html) {
	font-family:
		-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif;
	background: var(--ios-grouped-bg);
	color: var(--ios-label);
	-webkit-font-smoothing: antialiased;
}

/* iOS spring-ish easing for micro-interactions (200–300ms). */
:root {
	--ios-ease: cubic-bezier(0.32, 0.72, 0, 1);
}
```

- [ ] **Step 2: Import tokens in the root layout**

Edit `src/routes/+layout.svelte` so the tokens load globally. Ensure the top of the file imports it (keep any existing Tailwind/`layout.css` import):

```svelte
<script lang="ts">
	import '$lib/styles/tokens.css';
	let { children } = $props();
</script>

{@render children?.()}
```

- [ ] **Step 3: Verify dev renders with tokens**

Run: `npm run dev`, open `/login`. Expected: background is iOS grouped grey (light) / black (dark, if OS in dark mode), SF font stack applied.

- [ ] **Step 4: Commit**

```bash
git add src/lib/styles/tokens.css src/routes/+layout.svelte
git commit -m "feat: iOS semantic color + typography design tokens"
```

---

### Task 7: iOS components — primitives (Button, Card, ListRow, TextField, Toggle, Spinner, EmptyState, Toast)

**Files (create each):**
- `src/lib/components/ios/Button.svelte`
- `src/lib/components/ios/Card.svelte`
- `src/lib/components/ios/ListRow.svelte`
- `src/lib/components/ios/TextField.svelte`
- `src/lib/components/ios/Toggle.svelte`
- `src/lib/components/ios/Spinner.svelte`
- `src/lib/components/ios/EmptyState.svelte`
- `src/lib/components/ios/toast.svelte.ts` (store) + `src/lib/components/ios/ToastHost.svelte`

> After writing EACH `.svelte` file, run the Svelte MCP `svelte-autofixer` until clean. All components are Svelte 5 runes. Touch targets ≥44px (`h-11`+).

- [ ] **Step 1: Button**

```svelte
<!-- src/lib/components/ios/Button.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		variant = 'filled',
		type = 'button',
		disabled = false,
		onclick,
		children
	}: {
		variant?: 'filled' | 'tinted' | 'plain' | 'destructive';
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: () => void;
		children: Snippet;
	} = $props();

	const styles = {
		filled: 'bg-[var(--ios-blue)] text-white',
		tinted: 'bg-[var(--ios-fill)] text-[var(--ios-blue)]',
		plain: 'text-[var(--ios-blue)]',
		destructive: 'bg-[var(--ios-red)] text-white'
	};
</script>

<button
	{type}
	{disabled}
	{onclick}
	class="flex h-11 min-w-11 items-center justify-center rounded-xl px-5 font-semibold transition duration-200 active:scale-[0.97] disabled:opacity-40 {styles[
		variant
	]}"
	style="transition-timing-function: var(--ios-ease)"
>
	{@render children()}
</button>
```

- [ ] **Step 2: Card**

```svelte
<!-- src/lib/components/ios/Card.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, padded = true }: { children: Snippet; padded?: boolean } = $props();
</script>

<div class="overflow-hidden rounded-2xl bg-[var(--ios-card)] {padded ? 'p-4' : ''}">
	{@render children()}
</div>
```

- [ ] **Step 3: ListRow**

```svelte
<!-- src/lib/components/ios/ListRow.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		onclick,
		divider = true,
		children,
		trailing
	}: {
		onclick?: () => void;
		divider?: boolean;
		children: Snippet;
		trailing?: Snippet;
	} = $props();
</script>

<div
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	{onclick}
	onkeydown={(e) => {
		if (onclick && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			onclick();
		}
	}}
	class="flex min-h-11 items-center justify-between gap-3 bg-[var(--ios-card)] px-4 py-3 {onclick
		? 'cursor-pointer active:bg-[var(--ios-fill)]'
		: ''} {divider ? 'border-b border-[var(--ios-separator)]' : ''}"
>
	<div class="min-w-0 flex-1">{@render children()}</div>
	{#if trailing}<div class="shrink-0">{@render trailing()}</div>{/if}
</div>
```

- [ ] **Step 4: TextField**

```svelte
<!-- src/lib/components/ios/TextField.svelte -->
<script lang="ts">
	let {
		value = $bindable(''),
		placeholder = '',
		type = 'text',
		inputmode,
		label
	}: {
		value?: string;
		placeholder?: string;
		type?: string;
		inputmode?: 'text' | 'numeric' | 'decimal';
		label?: string;
	} = $props();
</script>

<label class="block">
	{#if label}
		<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">{label}</span>
	{/if}
	<input
		{type}
		{inputmode}
		{placeholder}
		bind:value
		class="h-11 w-full rounded-xl bg-[var(--ios-fill)] px-4 text-[var(--ios-label)] outline-none focus:ring-2 focus:ring-[var(--ios-blue)]"
	/>
</label>
```

- [ ] **Step 5: Toggle (iOS switch)**

```svelte
<!-- src/lib/components/ios/Toggle.svelte -->
<script lang="ts">
	let {
		checked = $bindable(false),
		label
	}: { checked?: boolean; label?: string } = $props();
</script>

<label class="flex items-center justify-between gap-3">
	{#if label}<span class="text-[var(--ios-label)]">{label}</span>{/if}
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		onclick={() => (checked = !checked)}
		class="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 {checked
			? 'bg-[var(--ios-green)]'
			: 'bg-[var(--ios-fill)]'}"
		style="transition-timing-function: var(--ios-ease)"
	>
		<span
			class="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 {checked
				? 'translate-x-[20px]'
				: ''}"
			style="transition-timing-function: var(--ios-ease)"
		></span>
	</button>
</label>
```

- [ ] **Step 6: Spinner**

```svelte
<!-- src/lib/components/ios/Spinner.svelte -->
<div class="flex justify-center py-10" role="status" aria-label="Loading">
	<div
		class="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--ios-fill)] border-t-[var(--ios-label-secondary)]"
	></div>
</div>
```

- [ ] **Step 7: EmptyState**

```svelte
<!-- src/lib/components/ios/EmptyState.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		subtitle,
		action
	}: { title: string; subtitle?: string; action?: Snippet } = $props();
</script>

<div class="flex flex-col items-center justify-center px-8 py-16 text-center">
	<p class="text-lg font-semibold text-[var(--ios-label)]">{title}</p>
	{#if subtitle}<p class="mt-1 text-[var(--ios-label-secondary)]">{subtitle}</p>{/if}
	{#if action}<div class="mt-5">{@render action()}</div>{/if}
</div>
```

- [ ] **Step 8: Toast store + host**

```ts
// src/lib/components/ios/toast.svelte.ts
type Toast = { id: number; message: string; kind: 'info' | 'error' };
let nextId = 0;
export const toasts = $state<Toast[]>([]);

export function showToast(message: string, kind: 'info' | 'error' = 'info') {
	const id = nextId++;
	toasts.push({ id, message, kind });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, 2500);
}
```

```svelte
<!-- src/lib/components/ios/ToastHost.svelte -->
<script lang="ts">
	import { toasts } from './toast.svelte';
</script>

<div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
	{#each toasts as t (t.id)}
		<div
			class="pointer-events-auto rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg {t.kind ===
			'error'
				? 'bg-[var(--ios-red)]'
				: 'bg-black/80'}"
		>
			{t.message}
		</div>
	{/each}
</div>
```

- [ ] **Step 9: Autofixer sweep + type-check**

Run `svelte-autofixer` on every `.svelte` file above until clean, then `npm run check`.
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/ios/
git commit -m "feat: iOS component primitives (button/card/row/field/toggle/spinner/empty/toast)"
```

---

### Task 8: iOS components — navigation + overlays (NavBar, SegmentedControl, BottomSheet, SearchBar, BottomTabBar)

**Files (create each):**
- `src/lib/components/ios/NavBar.svelte`
- `src/lib/components/ios/SegmentedControl.svelte`
- `src/lib/components/ios/BottomSheet.svelte`
- `src/lib/components/ios/SearchBar.svelte`
- `src/lib/components/ios/BottomTabBar.svelte`

> Run `svelte-autofixer` on each until clean.

- [ ] **Step 1: NavBar (large title)**

```svelte
<!-- src/lib/components/ios/NavBar.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, trailing }: { title: string; trailing?: Snippet } = $props();
</script>

<header
	class="sticky top-0 z-30 bg-[var(--ios-nav-blur)] px-4 pt-3 pb-2 backdrop-blur-xl"
	style="-webkit-backdrop-filter: blur(20px)"
>
	<div class="flex items-end justify-between">
		<h1 class="text-[34px] leading-tight font-bold tracking-tight text-[var(--ios-label)]">
			{title}
		</h1>
		{#if trailing}<div class="pb-2">{@render trailing()}</div>{/if}
	</div>
</header>
```

- [ ] **Step 2: SegmentedControl**

```svelte
<!-- src/lib/components/ios/SegmentedControl.svelte -->
<script lang="ts">
	let {
		options,
		value = $bindable()
	}: { options: { label: string; value: string }[]; value?: string } = $props();
</script>

<div class="flex gap-1 rounded-xl bg-[var(--ios-fill)] p-1" role="tablist">
	{#each options as opt (opt.value)}
		<button
			type="button"
			role="tab"
			aria-selected={value === opt.value}
			onclick={() => (value = opt.value)}
			class="h-9 flex-1 rounded-lg text-sm font-medium transition duration-200 {value === opt.value
				? 'bg-[var(--ios-card)] text-[var(--ios-label)] shadow'
				: 'text-[var(--ios-label-secondary)]'}"
			style="transition-timing-function: var(--ios-ease)"
		>
			{opt.label}
		</button>
	{/each}
</div>
```

- [ ] **Step 3: BottomSheet**

```svelte
<!-- src/lib/components/ios/BottomSheet.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	let {
		open = $bindable(false),
		title,
		children
	}: { open?: boolean; title?: string; children: Snippet } = $props();

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-40">
		<button
			type="button"
			aria-label="Close"
			class="absolute inset-0 bg-black/40"
			onclick={close}
			transition:fade={{ duration: 200 }}
		></button>
		<div
			class="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-[20px] bg-[var(--ios-grouped-bg)] pb-[env(safe-area-inset-bottom)]"
			transition:fly={{ y: 600, duration: 300, opacity: 1 }}
			role="dialog"
			aria-modal="true"
		>
			<div class="sticky top-0 flex items-center justify-center pt-2 pb-1">
				<div class="h-1.5 w-9 rounded-full bg-[var(--ios-label-tertiary)]"></div>
			</div>
			{#if title}
				<div class="px-5 pb-2">
					<h2 class="text-xl font-bold text-[var(--ios-label)]">{title}</h2>
				</div>
			{/if}
			<div class="px-5 pt-1">{@render children()}</div>
		</div>
	</div>
{/if}
```

- [ ] **Step 4: SearchBar**

```svelte
<!-- src/lib/components/ios/SearchBar.svelte -->
<script lang="ts">
	let { value = $bindable(''), placeholder = 'Search' }: { value?: string; placeholder?: string } =
		$props();
</script>

<div class="flex h-9 items-center gap-2 rounded-xl bg-[var(--ios-fill)] px-3">
	<svg class="h-4 w-4 text-[var(--ios-label-secondary)]" viewBox="0 0 20 20" fill="currentColor">
		<path
			fill-rule="evenodd"
			d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z"
			clip-rule="evenodd"
		/>
	</svg>
	<input
		{placeholder}
		bind:value
		class="h-full w-full bg-transparent text-[var(--ios-label)] outline-none"
	/>
</div>
```

- [ ] **Step 5: BottomTabBar**

```svelte
<!-- src/lib/components/ios/BottomTabBar.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	let {
		tabs
	}: { tabs: { href: string; label: string; icon: string }[] } = $props();
</script>

<nav
	class="sticky bottom-0 z-30 flex border-t border-[var(--ios-separator)] bg-[var(--ios-nav-blur)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
	style="-webkit-backdrop-filter: blur(20px)"
>
	{#each tabs as tab (tab.href)}
		{@const active = page.url.pathname === tab.href}
		<a
			href={tab.href}
			class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium {active
				? 'text-[var(--ios-blue)]'
				: 'text-[var(--ios-label-secondary)]'}"
		>
			<span class="text-xl leading-none">{tab.icon}</span>
			{tab.label}
		</a>
	{/each}
</nav>
```

> `$app/state` `page` is the Svelte 5 rune-based replacement for the `$app/stores` `page` store. If the installed SvelteKit version lacks `$app/state`, fall back to `import { page } from '$app/stores'` and reference `$page.url.pathname`.

- [ ] **Step 6: Autofixer sweep + check**

`svelte-autofixer` each file until clean, then `npm run check`. Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ios/
git commit -m "feat: iOS navigation + overlay components (navbar/segmented/sheet/search/tabbar)"
```

---

### Task 9: Authenticated app shell

**Files:**
- Create: `src/routes/(app)/+layout.server.ts`
- Create: `src/routes/(app)/+layout.svelte`
- Move: `src/routes/+page.svelte` → `src/routes/(app)/+page.svelte` becomes the dashboard (Task 10 fills it)
- Delete: `src/routes/demo/` (scaffold demo routes), `src/lib/vitest-examples/` if `npm run check` flags them

> The `(app)` route group holds every authenticated page; the shell renders NavBar context + the BottomTabBar. `/login` and `/logout` stay OUTSIDE the group (no shell).

- [ ] **Step 1: Layout server load (expose user)**

Create `src/routes/(app)/+layout.server.ts`:

```ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// hooks.server.ts already guaranteed a user for non-public routes.
	return { user: locals.user };
};
```

- [ ] **Step 2: Shell layout**

Create `src/routes/(app)/+layout.svelte`:

```svelte
<script lang="ts">
	import BottomTabBar from '$lib/components/ios/BottomTabBar.svelte';
	import ToastHost from '$lib/components/ios/ToastHost.svelte';
	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/discounts', label: 'Discounts', icon: '🏷️' }
	];
</script>

<div class="flex min-h-screen flex-col bg-[var(--ios-grouped-bg)]">
	<main class="flex-1">{@render children?.()}</main>
	<BottomTabBar {tabs} />
</div>
<ToastHost />
```

- [ ] **Step 3: Move home page into the group + remove demo**

Run:
```bash
mkdir -p "src/routes/(app)"
git mv src/routes/+page.svelte "src/routes/(app)/+page.svelte"
rm -rf src/routes/demo
```
(If `git mv` fails because the file is untracked, use a plain `mv`.)

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: 0 errors. If `src/lib/vitest-examples/*` cause failures, `rm -rf src/lib/vitest-examples` and re-run.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: authenticated (app) shell with bottom tab bar; drop scaffold demos"
```

---

### Task 10: Dashboard page

**Files:**
- Modify: `src/routes/(app)/+page.svelte`

- [ ] **Step 1: Write the dashboard**

Replace `src/routes/(app)/+page.svelte`:

```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';

	type Summary = { sales: number; orders: number };
	type TopMenu = { name: string; qty_sold: number; revenue: number };

	let summary = $state<Summary | null>(null);
	let top = $state<TopMenu[]>([]);
	let loading = $state(true);
	let errored = $state(false);

	const baht = (n: number) =>
		'฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	async function load() {
		loading = true;
		errored = false;
		try {
			const [s, t] = await Promise.all([
				fetch('/api/dashboard/').then((r) => r.json()),
				fetch('/api/dashboard/top-menus').then((r) => r.json())
			]);
			summary = s.data;
			top = t.data ?? [];
		} catch {
			errored = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});
</script>

<NavBar title="Dashboard" />

<div class="space-y-4 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn’t load data" subtitle="Pull down or try again later." />
	{:else}
		<div class="grid grid-cols-2 gap-3">
			<Card>
				<p class="text-sm text-[var(--ios-label-secondary)]">Today’s Sales</p>
				<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{baht(summary?.sales ?? 0)}</p>
			</Card>
			<Card>
				<p class="text-sm text-[var(--ios-label-secondary)]">Orders</p>
				<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{summary?.orders ?? 0}</p>
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Top Items Today</p>
			{#if top.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No sales yet today.</p></Card>
			{:else}
				<Card padded={false}>
					{#each top as m, i (m.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < top.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{m.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{m.qty_sold} · {baht(m.revenue)}</span>
						</div>
					{/each}
				</Card>
			{/if}
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Autofixer + manual verify**

Run `svelte-autofixer` until clean. Then with backend + `npm run dev` running and logged in, open `/`. Expected: two stat cards (today's sales in ฿ with 2 decimals, order count) + top-items list, or a clean empty state if no sales.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/+page.svelte"
git commit -m "feat: iOS dashboard page (today summary + top items)"
```

---

### Task 11: Discounts CRUD page (the proof page)

**Files:**
- Create: `src/routes/(app)/discounts/+page.svelte`
- Create: `src/lib/api/discounts.ts`

- [ ] **Step 1: Typed client for discounts**

Create `src/lib/api/discounts.ts`:

```ts
export type DiscountType = 'fixed' | 'percent';

export interface Discount {
	id: number;
	name: string;
	discount_type: DiscountType;
	value: number; // THB for fixed, percent for percent
	active: boolean;
	is_subsidy: boolean;
}

export interface DiscountInput {
	name: string;
	discount_type: DiscountType;
	value: number;
	active: boolean;
	is_subsidy: boolean;
}

async function json<T>(res: Response): Promise<T> {
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
	return body.data as T;
}

export const listDiscounts = () => fetch('/api/discounts').then((r) => json<Discount[]>(r));

export const createDiscount = (input: DiscountInput) =>
	fetch('/api/discounts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	}).then((r) => json<Discount>(r));

export const updateDiscount = (id: number, input: DiscountInput) =>
	fetch(`/api/discounts/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	}).then((r) => json<Discount>(r));

export const deleteDiscount = (id: number) =>
	fetch(`/api/discounts/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
```

- [ ] **Step 2: Write the page**

Create `src/routes/(app)/discounts/+page.svelte`:

```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import SearchBar from '$lib/components/ios/SearchBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		listDiscounts,
		createDiscount,
		updateDiscount,
		deleteDiscount,
		type Discount,
		type DiscountType
	} from '$lib/api/discounts';

	let discounts = $state<Discount[]>([]);
	let loading = $state(true);
	let query = $state('');

	let sheetOpen = $state(false);
	let editingId = $state<number | null>(null);
	let fName = $state('');
	let fType = $state<DiscountType>('fixed');
	let fValue = $state('');
	let fActive = $state(true);
	let fSubsidy = $state(false);
	let saving = $state(false);

	const filtered = $derived(
		discounts.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
	);

	const fmtValue = (d: Discount) =>
		d.discount_type === 'percent' ? `${d.value}%` : `฿${d.value.toFixed(2)}`;

	async function refresh() {
		loading = true;
		try {
			discounts = await listDiscounts();
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editingId = null;
		fName = '';
		fType = 'fixed';
		fValue = '';
		fActive = true;
		fSubsidy = false;
		sheetOpen = true;
	}

	function openEdit(d: Discount) {
		editingId = d.id;
		fName = d.name;
		fType = d.discount_type;
		fValue = String(d.value);
		fActive = d.active;
		fSubsidy = d.is_subsidy;
		sheetOpen = true;
	}

	async function save() {
		const value = parseFloat(fValue);
		if (!fName.trim()) return showToast('Name is required', 'error');
		if (Number.isNaN(value) || value < 0) return showToast('Enter a valid amount', 'error');
		if (fType === 'percent' && value > 100) return showToast('Percent cannot exceed 100', 'error');
		saving = true;
		const input = {
			name: fName.trim(),
			discount_type: fType,
			value,
			active: fActive,
			is_subsidy: fSubsidy
		};
		try {
			if (editingId === null) await createDiscount(input);
			else await updateDiscount(editingId, input);
			sheetOpen = false;
			await refresh();
			showToast('Saved');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (editingId === null) return;
		if (!confirm('Delete this discount?')) return;
		try {
			await deleteDiscount(editingId);
			sheetOpen = false;
			await refresh();
			showToast('Deleted');
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}

	$effect(() => {
		refresh();
	});
</script>

<NavBar title="Discounts">
	{#snippet trailing()}
		<Button variant="plain" onclick={openCreate}>＋ New</Button>
	{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	<SearchBar bind:value={query} placeholder="Search discounts" />

	{#if loading}
		<Spinner />
	{:else if filtered.length === 0}
		<EmptyState
			title={query ? 'No matches' : 'No discounts yet'}
			subtitle={query ? 'Try a different search.' : 'Create your first preset discount.'}
		>
			{#snippet action()}
				{#if !query}<Button onclick={openCreate}>Create Discount</Button>{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<Card padded={false}>
			{#each filtered as d, i (d.id)}
				<ListRow divider={i < filtered.length - 1} onclick={() => openEdit(d)}>
					<div class="flex items-center gap-2">
						<span class="font-medium text-[var(--ios-label)]">{d.name}</span>
						{#if !d.active}
							<span class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-label-secondary)]">Off</span>
						{/if}
						{#if d.is_subsidy}
							<span class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-blue)]">Subsidy</span>
						{/if}
					</div>
					{#snippet trailing()}
						<span class="text-[var(--ios-label-secondary)]">{fmtValue(d)}</span>
					{/snippet}
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={sheetOpen} title={editingId === null ? 'New Discount' : 'Edit Discount'}>
	<div class="space-y-4 pb-6">
		<TextField label="Name" bind:value={fName} placeholder="e.g. Staff 10%" />
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Type</span>
			<SegmentedControl
				bind:value={fType}
				options={[
					{ label: 'Fixed (฿)', value: 'fixed' },
					{ label: 'Percent (%)', value: 'percent' }
				]}
			/>
		</div>
		<TextField
			label={fType === 'percent' ? 'Percent off' : 'Baht off'}
			bind:value={fValue}
			inputmode="decimal"
			placeholder={fType === 'percent' ? '10' : '50.00'}
		/>
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>
		<Card><Toggle label="Subsidy (sponsor-covered)" bind:checked={fSubsidy} /></Card>

		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editingId !== null}
			<Button variant="destructive" onclick={remove}>Delete</Button>
		{/if}
	</div>
</BottomSheet>
```

- [ ] **Step 3: Autofixer + manual verify (full CRUD)**

Run `svelte-autofixer` until clean. With backend + `npm run dev`, logged in, open `/discounts`:
- List loads (or empty state).
- ＋ New → sheet slides up; create a fixed ฿50 discount → appears in list, toast "Saved".
- Tap a row → edit sheet pre-filled; flip Active off → row shows "Off" badge.
- Switch type to Percent, value 10 → row shows `10%`.
- Delete → confirm → row gone.
- Search filters by name.
Watch the network tab: every call hits `/api/discounts*` (the proxy), returns 200/201/204.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/ "src/routes/(app)/discounts/"
git commit -m "feat: iOS discounts CRUD page (list/search/sheet/create/edit/delete)"
```

---

### Task 12: Dockerfile + Tailscale entrypoint + render config

**Files:**
- Create: `Dockerfile`
- Create: `docker-entrypoint.sh`
- Create: `render.yaml`
- Modify: `.dockerignore` (create)

- [ ] **Step 1: `.dockerignore`**

```
node_modules
.svelte-kit
build
.git
.env
test-results
playwright-report
```

- [ ] **Step 2: Dockerfile**

Create `Dockerfile`:

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --production

# ---- run ----
FROM node:22-alpine
WORKDIR /app
# Tailscale static binaries
RUN apk add --no-cache ca-certificates iptables ip6tables curl \
 && curl -fsSL https://pkgs.tailscale.com/stable/tailscale_1.78.1_amd64.tgz -o ts.tgz \
 && tar xzf ts.tgz --strip-components=1 -C /usr/local/bin tailscale_1.78.1_amd64/tailscale tailscale_1.78.1_amd64/tailscaled \
 && rm ts.tgz
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]
```

> Pin the Tailscale version deliberately (`1.78.1` shown); bump intentionally, never float `latest`. Confirm the current stable URL at build time.

- [ ] **Step 3: Entrypoint (userspace tailscaled + node)**

Create `docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

# Start tailscaled in userspace networking mode with an HTTP/SOCKS proxy on :1055.
/usr/local/bin/tailscaled \
	--tun=userspace-networking \
	--socks5-server=localhost:1055 \
	--outbound-http-proxy-listen=localhost:1055 \
	--state=mem: &

# Join the tailnet (ephemeral node, auto-removed on shutdown/redeploy).
/usr/local/bin/tailscale up \
	--authkey="${TS_AUTHKEY}" \
	--hostname="${TS_HOSTNAME:-mulan-manager}" \
	--accept-routes

echo "tailscale up; backend via ${BACKEND_URL}"
exec node build
```

- [ ] **Step 4: `render.yaml`**

Create `render.yaml`:

```yaml
services:
  - type: web
    name: mulan-manager
    runtime: docker
    plan: starter
    healthCheckPath: /login
    envVars:
      - key: PORT
        value: 3000
      - key: BACKEND_URL
        sync: false # set to http://<backend-magicdns-host>:8080 in the dashboard
      - key: TS_HTTP_PROXY
        value: http://127.0.0.1:1055
      - key: TS_AUTHKEY
        sync: false # ephemeral, tagged Tailscale auth key — set as a secret
      - key: TS_HOSTNAME
        value: mulan-manager
```

- [ ] **Step 5: Local Docker smoke test (no Tailscale)**

Run:
```bash
docker build -t mulan-manager:test .
docker run --rm -e TS_AUTHKEY="" -e TS_HTTP_PROXY="" \
	-e BACKEND_URL="http://host.docker.internal:8080" -p 3000:3000 mulan-manager:test
```
Expected: image builds; container starts node (the `tailscale up` line will error without a key — acceptable for the smoke test of the Node server; to fully verify the proxy path, supply a real `TS_AUTHKEY` and tailnet `BACKEND_URL`). Hitting `http://localhost:3000/login` returns the login page HTML.

> The DEFINITIVE proof of the Tailscale path happens on render (Task 13 step 3), since that's the real userspace-networking environment.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-entrypoint.sh render.yaml .dockerignore
git commit -m "feat: docker image with userspace tailscaled + render config"
```

---

### Task 13: Playwright e2e + render deploy verification

**Files:**
- Create: `e2e/login-flow.spec.ts`
- Modify: `playwright.config.ts` (if needed for baseURL/webServer)

- [ ] **Step 1: Write the e2e (requires backend + seeded user on :8080)**

Create `e2e/login-flow.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const USER = process.env.E2E_USER ?? 'owner';
const PASS = process.env.E2E_PASS ?? 'changeme123';

test('redirects to login when unauthenticated', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('login → dashboard → discounts CRUD', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="username"]', USER);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

	await page.getByRole('link', { name: 'Discounts' }).click();
	await expect(page.getByRole('heading', { name: 'Discounts' })).toBeVisible();

	const name = 'E2E ' + Date.now();
	await page.getByRole('button', { name: '＋ New' }).click();
	await page.getByPlaceholder('e.g. Staff 10%').fill(name);
	await page.getByPlaceholder('50.00').fill('25');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(name)).toBeVisible();
});
```

- [ ] **Step 2: Run e2e locally**

Run (backend on :8080 with seeded user, then): `npm run test:e2e`
Expected: 2 passing. Playwright starts the dev server per `playwright.config.ts`; if `webServer` isn't configured, add it:
```ts
// playwright.config.ts — inside defineConfig
webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
use: { baseURL: 'http://localhost:5173' }
```

- [ ] **Step 3: Deploy to render + verify the Tailscale path (the real proof)**

1. Create an ephemeral, tagged Tailscale auth key (Admin console → Settings → Keys; tag e.g. `tag:render`). Ensure the backend node's ACL allows `tag:render` to reach it on the backend port.
2. In render: New → Blueprint (from the repo's `render.yaml`), or a Docker web service. Set `BACKEND_URL=http://<backend-magicdns-host>:8080` and `TS_AUTHKEY=<the key>` as env vars/secrets.
3. After deploy, open the render URL → expect redirect to `/login`. Sign in with the seeded owner. Expect the dashboard to load REAL data and discounts CRUD to work — this proves browser → render → tailscaled → backend end-to-end.
4. Confirm in the Tailscale admin console that an ephemeral `mulan-manager` node appeared while the service is up.

- [ ] **Step 4: Push the branch + open a PR**

```bash
git push -u origin HEAD
gh pr create --fill
```

- [ ] **Step 5: Commit any config tweaks**

```bash
git add playwright.config.ts e2e/
git commit -m "test: e2e login → dashboard → discounts; render deploy verified"
```

---

## Self-Review (completed)

- **Spec coverage:** §2/§3 topology — adapter-node (T1), dispatcher+proxy (T2,T5), Dockerfile+userspace tailscaled (T12), render config (T12), real proof on render (T13.3) ✓. §4/§5 auth — httpOnly cookie (T3), login/logout (T4), proxy injects bearer + allowlist (T5), guard (T3) ✓. §6 frontend arch — proxy route, hooks, cookie, component library, paraglide present ✓. §7 slice — login+dashboard+discounts (T4,T10,T11) ✓. §8 dev/prod split — TS_HTTP_PROXY empty in dev (T1,T2) ✓. §9 testing — vitest (T2), playwright (T13), manual viewport checks (T4,T10,T11) ✓.
- **No-magic check:** the unproven Tailscale-in-container path is explicitly labelled "proof on render" (T12.5, T13.3), not assumed working.
- **Placeholder scan:** every code step contains complete, runnable code. The only deliberately-deferred verification is the live render deploy, which cannot be done locally — called out, not hidden.
- **Type consistency:** `Discount`/`DiscountInput`/`DiscountType` defined once (T11.1) and reused; `ManagerUser` typed in app.d.ts (T3) and consumed in hooks + layout; `callBackend`/`buildBackendUrl` signatures stable across T2→T3→T4→T5; component prop names (`bind:value`, `bind:checked`, `bind:open`) consistent between components (T7,T8) and the discounts page (T11).
- **Svelte 5 correctness:** runes (`$state/$props/$derived/$effect/$bindable`), snippets (`{@render}`, `{#snippet}`), `onclick`. `$app/state` fallback to `$app/stores` noted (T8.5). Autofixer step on every `.svelte` file enforces correctness at execution.

## Risks / reversibility
- All work is in the (previously empty) `mulan-manager` repo + additive backend (other plan). Rollback = redeploy previous render image / revert commits. No destructive ops. Old Go `/manager/*` pages remain the live manager until this app fully replaces them.
- Per-request dispatcher (not global) means a misconfigured proxy can't silently break unrelated outbound calls.
