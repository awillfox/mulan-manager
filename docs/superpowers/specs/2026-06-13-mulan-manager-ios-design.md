# mulan-manager — iOS-style SvelteKit manager, render + Tailscale-proxied to `mulan`

**Date:** 2026-06-13
**Status:** Design — awaiting user review before implementation planning.

## 1. Goal

Rebuild the `mulan` POS manager UI as a standalone SvelteKit application:

- **Phone-first, responsive to desktop.** iOS Human Interface Guidelines look and feel — indistinguishable from a first-party iPhone app, while remaining usable on a computer.
- **Manager-only.** Does not touch the POS terminal UI (still served by `mulan` / `mulan-agent`).
- **Deployed on render.com.** Reaches the private Go `mulan` backend over Tailscale.
- **New multi-user + role auth** added to the Go backend (none exists today).
- **Vertical slice first** to prove the hard infrastructure before building UI breadth.

## 2. Current state (verified)

- **Backend `mulan`** (Go, chi, pgx, sqlc): full `/api/*` JSON API + `/events` SSE hub. Manager pages currently server-rendered by Go (`/manager/items`, `/discounts`, `/members`, `/cashiers`, `/settings`, dashboard).
- **CORS** locked to `localhost:*` / `127.0.0.1:*` — irrelevant under the chosen topology (same-origin proxy), so left unchanged.
- **Auth:** only cashier PIN login (`POST /api/cashiers/login`, bcrypt) for POS staff. Returns a cashier object, **issues no token, has no middleware.** No manager user table. No bearer flow anywhere.
- **`mulan-manager`** (this repo): fresh SvelteKit minimal scaffold (Svelte 5, Tailwind v4, paraglide en + th-th, vitest, playwright, `adapter-auto`). Nothing built.

## 3. Topology and deployment

```
Browser ──HTTPS (same-origin)──▶ render: SvelteKit (adapter-node)
                                   └─ tailscaled (userspace) — proxy on :1055
                                        └─ WireGuard ─▶ mulan backend (private, no public port)
```

Decision: **SvelteKit server proxies over Tailscale; the backend is never exposed publicly.** The browser is same-origin to render — CORS is moot, and the session token lives in an httpOnly cookie on render.

Deploy unit and mechanism:

- **Dockerfile** (render Docker web service). Entrypoint script:
  1. `tailscaled --tun=userspace-networking --outbound-http-proxy-listen=localhost:1055 --socks5-server=localhost:1055 &`
  2. `tailscale up --authkey=$TS_AUTHKEY --hostname=mulan-manager --ephemeral`
  3. `node build`
- **Swap `@sveltejs/adapter-auto` → `@sveltejs/adapter-node`.**
- **Outbound proxy (no magic):** userspace `tailscaled` has no kernel TUN, so Node's outbound connections must traverse its proxy. Set `undici`'s global dispatcher to `new ProxyAgent('http://127.0.0.1:1055')`; SvelteKit server `fetch('http://mulan.<tailnet>:PORT/...')` then tunnels via HTTP CONNECT to the tailnet host (MagicDNS name). **This mechanism is planned, not yet verified — proving it on render is the primary purpose of the vertical slice.**
- **Ephemeral + tagged Tailscale auth key** so render redeploys auto-remove the stale node.

## 4. Authentication

New backend feature package `internal/managerauth` (domain / service / http), following the repo's feature-layered convention. Entirely separate from `cashiers`.

### Tables (additive)

- **`manager_users`**: `id, username, password_hash (bcrypt), name, role, active, created_at, updated_at`. `role` enum: `owner | staff`.
- **`manager_sessions`**: `id, manager_user_id, token_hash, expires_at, created_at, revoked_at`. **Opaque token, hashed at rest, revocable.**

### Endpoints

- `POST /api/auth/login` `{username, password}` → `{token, user:{id,name,role}, expires_at}` (open).
- `POST /api/auth/logout` → revoke current session (requires bearer).
- `GET /api/auth/me` → current user (requires bearer).

### Middleware

- `RequireManager`: extracts `Authorization: Bearer`, looks up the (hashed) session, checks `expires_at` / `revoked_at`, loads the user into request context. Returns 401 on failure.
- `RequireRole(roles...)`: gates owner-only actions. Returns 403 on mismatch.

### Token lifecycle

- Opaque random token (32+ bytes), stored hashed; compared on each request.
- Expiry (e.g. 30 days sliding or fixed — finalize in plan). Logout revokes. No JWT, no signing-secret rotation.

## 5. Route protection (POS-safety — the load-bearing risk)

**Principle: default-open on the tailnet, opt-in protection on manager routes.** Wrapping all of `/api/*` would break POS checkout. The middleware is applied only to manager route groups.

**Stay OPEN (POS / agent / shared — never wrapped):**

| Route | Used by |
|---|---|
| `POST /api/orders/...` (checkout) | POS |
| `POST /api/cashiers/login` | POS |
| `GET /api/members/lookup` | POS (loyalty lookup at pay) |
| `GET /api/menus`, `GET /api/menus/{id}` | POS (+ manager reads) |
| `GET /api/menu-categories` | shared read |
| `GET /api/discounts/active` | POS discount picker |
| `GET /api/settings` | shared read |
| `/api/cash-drawer/...` | agent |
| `/api/wifi/...` | guest wifi / captive |
| `/events` (SSE) | both (cookie-auth deferred) |

**Protected with `RequireManager` (manager-only):** menu/category/option-group/option/base-option **writes**, `GET/POST/PATCH/DELETE /api/discounts` (except `/active`), `/api/members` management (except `/lookup`), `/api/cashiers` CRUD (except `/login`), `PATCH /api/settings`, `/api/dashboard/...`.

**For the vertical slice, only these are wrapped now:** `/api/auth/*` (login open; logout + me require bearer), the manager `/api/discounts` routes (list / create / update / delete; `/active` stays open), and whatever `/api/dashboard/*` the dashboard screen reads. Everything else is touched later, page by page. Minimal blast radius.

## 6. Frontend architecture

- **Server proxy route** `src/routes/api/[...path]/+server.ts`: forwards browser `/api/*` requests to the backend through the Tailscale dispatcher, **injecting the bearer from the httpOnly session cookie**. Allowlists backend host + permitted path prefixes — **not** an open proxy onto the tailnet. SSE passthrough for `/events`.
- **`hooks.server.ts`**: reads the session cookie, resolves the user via `GET /api/auth/me`, gates protected routes, redirects unauthenticated users to `/login`. Exposes `event.locals.user`.
- **Session cookie:** httpOnly, Secure, SameSite=Lax, holds the opaque token. Never readable from browser JS (XSS-resistant).
- **Role in UI:** `locals.user.role` drives conditional rendering (owner-only controls) — defence in depth on top of backend `RequireRole`.

### iOS component library

`src/lib/components/ios/` — reusable Svelte 5 primitives, built with the `frontend-design` skill and validated with the Svelte MCP `svelte-autofixer`:

NavBar (large titles), SearchBar, Card, List + Row, Button, Form fields, Toggle, SegmentedControl, BottomSheet, Modal, Toast, EmptyState, Loading/Skeleton, BottomTabBar.

**Design tokens:** SF Pro Display/Text font stack with system fallback; 8pt spacing scale; 12–20px corner radii by component; subtle shadows only where needed; sparing translucency/glassmorphism; semantic color tokens with full Light + Dark mode; 200–300ms spring transitions; ≥44×44px touch targets; WCAG AA contrast; semantic HTML.

### i18n

Paraglide (already scaffolded) — en + th-th. Manager copy in both; default likely Thai.

## 7. Vertical slice deliverable

End-to-end on render, proxied over Tailscale, with real multi-user+role auth:

1. **Login screen** — username/password → sets httpOnly session cookie.
2. **Dashboard** — read-only stat cards (iOS card + loading + empty states).
3. **Discounts CRUD** — the proof page:
   - List of preset discounts (List/Row, SearchBar, EmptyState).
   - Add/Edit in an **iOS BottomSheet**: name, **SegmentedControl** fixed/percent, currency/percent value input, **Toggle** active, **Toggle** is_subsidy.
   - Delete with confirm.
   - Bound to `/api/discounts` (manager-protected); money handled as int subunits, formatted once at display.

Chosen because discounts are manager-only on writes (POS reads only `/active`) → lowest POS-coupling risk, and the page exercises the widest set of iOS components.

## 8. Dev vs prod

- **Dev:** SvelteKit dev server → local backend directly (base URL via env, no Tailscale). Same `/api/[...path]` proxy, dispatcher disabled.
- **Prod:** render + Tailscale proxy. Env vars: backend base URL (tailnet host), `TS_AUTHKEY`, session-cookie/signing secret.

## 9. Testing

- vitest component tests on the iOS primitives.
- playwright e2e on login → dashboard → discounts CRUD at phone viewport.
- Manual verification on a real phone width and a desktop width; watch the network tab for failed proxied calls.
- Backend: table-driven tests for `managerauth` (login, expiry, revoke, role gating) + confirmation that POS-open routes remain reachable without a token.

## 10. Pressure test

- **Blast radius:** the only backend behavioural change is new middleware on selected route groups — could break POS if mis-scoped. Mitigated by default-open + slice-only wrapping; failures are loud (401/403), not silent. New tables/endpoints are purely additive.
- **Reversibility:** additive schema + endpoints; middleware applied per route group → remove the wrapper to roll back. render rolls back by redeploying the previous image. Old Go `/manager/*` pages remain live until the SvelteKit app fully replaces them — nothing deleted prematurely.
- **Blind spot:** `tailscaled` inside a render container is the unproven piece. The slice exists specifically to verify it before investing in UI breadth.

## 11. Out of scope (YAGNI)

- Porting all manager pages (only the slice now).
- Points redemption, any POS/agent changes.
- Decommissioning the old Go `/manager/*` pages.
- Cookie-auth on `/events` SSE (deferred until a page needs live updates).

## 12. Open items to finalize in the implementation plan

- Exact session expiry policy (sliding vs fixed) and length.
- Whether `manager_users` seeding is a CLI command (cf. existing `cmd/`) or a one-off SQL insert for the first owner.
- Dashboard's concrete stat set (reuse existing `/api/dashboard/*` shapes).
