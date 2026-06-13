# mulan-manager

Phone-first, iOS-style **SvelteKit** manager frontend for the [`mulan`](../mulan) Go POS. Deployed on **render.com**; talks to the private Go backend over **Tailscale**. Replaces the old Go `html/template` `/manager/*` pages.

> Conventions, route-scoping rules, and the gotchas live in [`CLAUDE.md`](./CLAUDE.md). This README is how to run, test, and ship it.

## Stack

SvelteKit 2 · **Svelte 5 (runes)** · `@sveltejs/adapter-node` · Tailwind v4 · paraglide (en / th-th) · vitest · playwright · undici.

## Architecture (short)

```
Browser ─HTTPS─▶ render (SvelteKit, adapter-node)
                  └ tailscaled (userspace) proxy :1055
                       └WireGuard▶ mulan backend (chaiyarak 100.109.90.83:8085, private)
```

The browser only ever talks to the SvelteKit server (same-origin). `src/routes/api/[...path]/+server.ts` proxies allow-listed `/api/*` calls to the backend over Tailscale, injecting the bearer from an httpOnly session cookie. Auth = httpOnly cookie + `owner`/`staff` roles enforced by the backend.

## Develop

Requires Node 22+, npm, and a reachable `mulan` backend (locally on `:8080`, or the tailnet host).

```sh
npm install
cp .env.example .env        # set BACKEND_URL; leave TS_HTTP_PROXY empty for dev (direct fetch)
npm run dev                 # http://localhost:5173
```

`.env` (dev):

```
BACKEND_URL=http://localhost:8080     # or http://100.109.90.83:8085 to hit the live backend over the tailnet
TS_HTTP_PROXY=                        # empty in dev = direct; the Tailscale proxy is prod-only
TS_AUTHKEY=
```

Log in with a manager user (seed one on the backend: `go run ./cmd/create-manager-user -username owner -password '…' -name 'Owner' -role owner`).

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build (adapter-node) / preview |
| `npm run check` | `svelte-check` (type-check) — must be 0 errors |
| `npm run lint` / `npm run format` | prettier + eslint |
| `npm run test:unit -- --run` | vitest unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | playwright e2e (`e2e/` only) |

Run e2e against the live backend:

```sh
BACKEND_URL=http://100.109.90.83:8085 E2E_USER=owner E2E_PASS=… npx playwright test
```

## Project structure

```
src/
├── routes/
│   ├── login/  logout/                 # auth (cookie set/cleared server-side)
│   ├── api/[...path]/+server.ts         # allow-listed proxy → backend (cookie→bearer, binary-safe)
│   └── (app)/                           # authenticated shell (4-tab nav)
│       ├── +page.svelte                 # Dashboard
│       ├── menu/  members/  more/       # tabs (More → option-groups, discounts, cashiers, settings, account)
│       ├── option-groups/ cashiers/ settings/ discounts/
│       └── …
├── lib/
│   ├── api/*.ts                         # typed clients (menus, members, settings, account, …)
│   ├── components/ios/                  # iOS component library
│   ├── server/                          # backend fetch + dispatcher + session
│   └── styles/tokens.css                # iOS design tokens (light/dark)
├── hooks.server.ts                      # session resolve + route guard (+ paraglide)
e2e/                                     # playwright specs
docs/superpowers/{specs,plans}/          # design + implementation docs
```

## Deploy

render Docker web service, auto-deploys from `main`. Set env vars in render → **Environment** (not Secret Files): `BACKEND_URL`, `TS_HTTP_PROXY=http://127.0.0.1:1055`, `TS_AUTHKEY` (Tailscale **auth key** — make it **ephemeral + reusable** so redeploys don't pile up stale tailnet nodes), `TS_HOSTNAME`, `PORT=3000`. The container can't go live without joining the tailnet, so a stale/invalid `TS_AUTHKEY` blocks deploys. Backend deploy + ops: see `../mulan/CLAUDE.md`.
