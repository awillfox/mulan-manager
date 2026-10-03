# mulan-manager

A phone-first, iOS-style **SvelteKit** manager app for the [`mulan`](../mulan) Go POS. It covers the dashboard, orders (including voiding paid orders), menu, option groups, discounts, members, cashiers, the cash drawer, display images and settings. It replaced the old Go `html/template` `/manager/*` write pages.

> Conventions, route-scoping rules and gotchas are in [`CLAUDE.md`](./CLAUDE.md). This README covers how to run, test and ship the app.

## Stack

SvelteKit 2 · **Svelte 5 (runes)** · `@sveltejs/adapter-node` · Tailwind v4 · paraglide (en / th-th) · vitest · playwright · undici.

## Architecture (short)

```
Browser ──▶ SvelteKit server (adapter-node)
              └ /api/[...path] proxy (allow-listed, cookie → bearer) ──▶ mulan backend :8085
```

- The browser only talks to the SvelteKit server, on the same origin.
- `src/routes/api/[...path]/+server.ts` proxies allow-listed `/api/*` calls to the backend and injects the bearer token from an httpOnly session cookie. The allowlist is in `allow.ts`. Of `orders/*`, only `orders/void-reasons` and `orders/<code>/void(/preview)` are exposed.
- The backend enforces auth with the `owner` / `staff` roles.

Two deployments exist:

| Where | How it reaches the backend |
|---|---|
| **coffee-server** (`100.86.43.70:5004`), systemd `mulan-manager` | same host: `BACKEND_URL=http://127.0.0.1:8085` |
| **render.com** (Docker web service) | userspace Tailscale proxy (`TS_HTTP_PROXY=http://127.0.0.1:1055`) to the tailnet backend |

## Develop

Requires Node 22+, npm, and a reachable mulan backend (locally on `:8080`, or the dev site).

```sh
npm install
cp .env.example .env        # set BACKEND_URL; leave TS_HTTP_PROXY empty in dev (direct fetch)
npm run dev                 # http://localhost:5173
```

`.env` keys:

| Key | Meaning |
|---|---|
| `BACKEND_URL` | mulan base URL, no trailing slash |
| `TS_HTTP_PROXY`, `TS_AUTHKEY`, `TS_HOSTNAME` | render only (Tailscale); empty in dev |
| `PUBLIC_BOOKYMAN_URL` | Music Player login URL (on-prem behind cloudflared); the dashboard sends a warm-up ping to it |
| `PUBLIC_BOOKYMAN_KEY` | magic-link key for the Music Player nav link. It reaches the browser, and the manager login is the real gate |
| `BODY_SIZE_LIMIT` | adapter-node request limit; set to about `11M` so image uploads aren't rejected at the proxy |

Log in with a manager user. To seed one on the backend:

```sh
go run ./cmd/create-manager-user -username owner -password '…' -name 'Owner' -role owner
```

The session cookie is `secure` in production builds. Over plain `http://` it only sticks on `localhost`, so use an SSH tunnel (`ssh -L 3000:127.0.0.1:<port> …`) when testing a remote build.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build (adapter-node) / preview |
| `npm run check` | `svelte-check` (type-check), must be 0 errors |
| `npm run lint` / `npm run format` | prettier + eslint |
| `npm run test:unit -- --run` | vitest unit tests (`src/**/*.spec.ts`) |
| `npm run test:e2e` | playwright e2e (`e2e/` only) |

## Project structure

```
src/
├── routes/
│   ├── login/  logout/                  # auth (cookie set/cleared server-side)
│   ├── api/[...path]/+server.ts, allow.ts  # allow-listed proxy → backend
│   └── (app)/                            # authenticated shell
│       ├── +page.svelte                  # Dashboard
│       ├── orders/                       # order history + Void… (VoidSheet)
│       ├── menu/ menu-generator/ option-groups/ discounts/
│       ├── members/ cashiers/ drawer/ images/ settings/ more/
├── lib/
│   ├── api/*.ts                          # typed clients (reports, voids, menus, members, …)
│   ├── components/ios/ + VoidSheet.svelte
│   ├── server/                           # backend fetch + session
│   └── styles/tokens.css                 # iOS design tokens (light/dark)
├── hooks.server.ts                       # session resolve + route guard (+ paraglide)
e2e/                                      # playwright specs
docs/superpowers/{specs,plans}/           # design + implementation docs
```

## Deploy

**coffee-server** (production, on the shop LAN and tailnet):
1. The source there is a copy, not a git checkout. Sync `src/` (rsync).
2. Build on the server with `npm run build` (the `.env` in `~/mulan-manager` is read at build time for `PUBLIC_*`).
3. Run `sudo systemctl restart mulan-manager`.
4. Keep a `build.bak.<date>` copy for rollback.

**render**:
- The Docker web service auto-deploys from `main`.
- Set the env vars in render → **Environment**: `BACKEND_URL`, `TS_HTTP_PROXY=http://127.0.0.1:1055`, `TS_AUTHKEY` (ephemeral + reusable auth key), `TS_HOSTNAME`, `PORT=3000`, `BODY_SIZE_LIMIT`, `PUBLIC_BOOKYMAN_*`.
- A stale `TS_AUTHKEY` blocks deploys.

Backend deploy and ops are covered in `../mulan/CLAUDE.md`.
