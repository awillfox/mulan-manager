## Project Overview

`mulan-manager` is a **phone-first, iOS-HIG SvelteKit** frontend for the **manager** side of the `mulan` Go POS (`../mulan`). It replaces the old Go `html/template` `/manager/*` pages. Deployed on **render.com**; reaches the private Go backend over **Tailscale**.

- **Language**: TypeScript · **Package Manager**: npm
- **Stack**: SvelteKit 2 + **Svelte 5 (runes)**, `@sveltejs/adapter-node`, Tailwind v4, paraglide (en/th-th), vitest, playwright, undici.

## Architecture

```
Browser ──HTTPS (same-origin)──▶ render: SvelteKit (adapter-node)
                                   └─ tailscaled (userspace) HTTP proxy :1055
                                        └─WireGuard─▶ mulan backend (coffee-server 100.86.43.70:8085, private)
```

- **Server-side API proxy** `src/routes/api/[...path]/+server.ts`: the browser calls `/api/*` same-origin; the proxy forwards to the backend over Tailscale, **injecting the bearer from the httpOnly session cookie**, restricted to an `ALLOW` prefix list (NOT an open tunnel). Reads the request body as **`arrayBuffer()`** (binary-safe — needed for multipart logo upload; `text()` corrupts it).
- **Backend fetch** `src/lib/server/backend.ts` uses **undici's own `fetch`** with its `ProxyAgent` dispatcher (`src/lib/server/dispatcher.ts`). ⚠️ Do NOT pass a standalone-`undici` `ProxyAgent` to Node's built-in `fetch` — throws `UND_ERR_INVALID_ARG: invalid onRequestStart method` (works in dev w/o proxy, fails only in prod).
- **`hooks.server.ts`** resolves the session via backend `GET /api/auth/me`, guards routes (redirect to `/login`), composed with the paraglide handle via `sequence(...)`. Auth **fails closed** (backend unreachable → unauthenticated).

## Auth

httpOnly cookie `mm_session` holds the opaque bearer (set by the `/login` form action, cleared by `/logout`). Roles `owner | staff`: backend enforces owner-only writes (staff → 403, surfaced as "Owner only"). Change-your-own-password: **More → Account → Change Password** (validates current). Backend contract + route scoping live in `../mulan/CLAUDE.md` (Manager Authentication).

## Pages & nav

`(app)` route group, **4-tab BottomTabBar**: Dashboard (`/`) · Menu (`/menu`) · Members (`/members`) · More (`/more`). `/more` groups: **Account** (Change Password, Sign Out), **Catalog** (Option Groups, Discounts), **Staff & Shop** (Cashiers, Settings). `/login` + `/logout` sit outside the group. Menu manager (`/menu`) is the most complex page (items by category, item editor with base options + shared/isolated option-group attach + sequential dual-PUT save + categories sheet).

## Conventions

- **Money is THB floats over the wire** (backend stores satang, converts at the edge). Display with `฿${n.toFixed(2)}`; never do float math beyond display.
- **Typed clients** per feature in `src/lib/api/*.ts` (`discounts`, `menus`, `categories`, `menuGroups`, `optionGroups`, `members`, `cashiers`, `settings`, `account`). Each parses the `{data,error}` envelope; re-fetch the list after a mutation (server is source of truth).
- **iOS component library** `src/lib/components/ios/` (NavBar, Card, ListRow, Button, TextField, Toggle, SegmentedControl, BottomSheet, Picker, SearchBar, Spinner, EmptyState, ToastHost, BottomTabBar, LogoUpload). Tokens in `src/lib/styles/tokens.css` (semantic colors, light/dark, 8pt, SF stack). Match the existing idiom; touch targets ≥44px.
- **Adding a manager API call:** add its prefix to `ALLOW` in `src/routes/api/[...path]/+server.ts` AND ensure the backend route is registered in the right auth group (`../mulan/main.go`).
- **Tests:** vitest unit (`src/**/*.spec.ts`, e.g. `menuGroups`/`optionGroups` serialization), playwright e2e in **`e2e/`** only (`playwright.config.ts` sets `testDir: 'e2e'` so it doesn't pick up vitest specs). Run e2e against the live backend with `BACKEND_URL=http://100.86.43.70:8085 npx playwright test`.

## Deploy

render Docker web service `mulan-manager`, auto-deploys from GitHub `awillfox/mulan-manager` `main`. Env vars (render **Environment**, not Secret Files): `BACKEND_URL`, `TS_HTTP_PROXY=http://127.0.0.1:1055`, `TS_AUTHKEY` (Tailscale **auth key** — use **ephemeral + reusable** so deploys don't pile up stale nodes), `TS_HOSTNAME`, `PORT=3000`. The container runs `tailscaled` (userspace) + `node build`; entrypoint requires a valid `TS_AUTHKEY` (a deploy can't go live without joining the tailnet). A `RENDER_TOKEN` (in `~/.bashrc`, below the non-interactive guard) hits the render API for deploys/logs/env-vars.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
