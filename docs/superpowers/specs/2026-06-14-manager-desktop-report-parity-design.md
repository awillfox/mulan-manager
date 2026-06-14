# Design — Desktop layout + Report parity for mulan-manager

**Date:** 2026-06-14
**Repo:** `mulan-manager` (SvelteKit; consumes mulan backend `/api/*`)
**Scope:** Frontend only. No backend or schema changes.

## Problem

The manager app is mobile-first and good on phones, but on desktop it renders as a
full-width stretched phone view — not reasonable to use. Separately, the
SvelteKit dashboard (`/(app)/+page.svelte`) shows only 2 KPIs + top items, far
short of the Go `/manager` dashboard (compare KPIs, charts, heatmap, subsidies
waterfall, date presets). We want the desktop layout to be usable and the report
page to reach **function parity** with the Go page — keeping the iOS look.

## Goals

1. Desktop (md+) is comfortably usable; mobile is unchanged.
2. Report page reaches full function parity with the Go dashboard.
3. Keep the existing iOS aesthetic and component idiom — no restyle.

## Non-goals

- No redesign of the visual language.
- No backend/API/schema changes (all dashboard endpoints already exist; `dashboard`
  is already in the proxy `ALLOW`).
- No retirement of the Go pages in this work (tracked separately in `mulan/TODO.md`).

## Constraints / facts (verified 2026-06-14)

- Svelte 5 (runes: `$state`/`$props`/`$effect`/`$bindable`), Tailwind v4, SvelteKit.
- SSR is on (no `ssr=false` overrides) → chart code must run client-side only.
- No chart library installed yet → **add `chart.js`** (user choice).
- Existing iOS components reused: `NavBar`, `Card`, `SegmentedControl` (presets),
  `ListRow`, `Spinner`, `EmptyState`, `BottomTabBar`.
- API proxy (`src/routes/api/[...path]/+server.ts`) attaches the session bearer to
  every `/api/*` call; dashboard endpoints support `?from=&to=` (ISO dates, shop-local).

## Backend endpoints consumed (existing)

| Endpoint                                  | Used for                                  |
| ----------------------------------------- | ----------------------------------------- |
| `GET /api/dashboard/compare?from&to`      | KPI grid + prev-period deltas + waterfall |
| `GET /api/dashboard/sales-by-day?from&to` | Sales-by-day chart (Chart.js)             |
| `GET /api/dashboard/heatmap?from&to`      | Day×hour heatmap (CSS grid)               |
| `GET /api/dashboard/top-menus?from&to`    | Top menus list + donut (Chart.js)         |
| `GET /api/dashboard/subsidies?from&to`    | Subsidies-by-program list                 |

(`GET /api/dashboard/` "today summary" is superseded by `/compare` with from=to=today.)

## Architecture

### 1. Responsive app shell — `(app)/+layout.svelte`

- New component `src/lib/components/ios/SideNav.svelte`: desktop-only (`hidden md:flex`)
  left rail, iPad-sidebar style using existing tokens. Lists all sections grouped:
  - Top: Dashboard, Menu, Members
  - Catalog: Option Groups, Discounts
  - Staff & Shop: Cashiers, Cash Drawer, Settings
  - Active route highlighted (matches `BottomTabBar` active logic).
- `BottomTabBar` becomes `md:hidden`; `SideNav` is `hidden md:flex`. **Mobile markup/behaviour unchanged.**
- Layout becomes a row on desktop: `<SideNav>` + `<main>`; column on mobile.
- `<main>` content width: mobile full-width with bottom-tab padding; desktop offset by
  the rail, centered, wide max-width (≈`max-w-5xl`), so pages can use multi-column grids.

### 2. Report page — `(app)/+page.svelte` (rebuilt)

Top-to-bottom sections, each a `Card`/group:

1. **Date presets** — `SegmentedControl` with Today / 7D / 30D / 90D. Selection computes
   `from`/`to` (shop-local ISO dates) and re-fetches. Default: 7D (matches Go default).
2. **KPI grid** — Net sales, Orders, Items, Avg ticket. Each shows value + prev-period
   delta (▲/▼ %, "no prior" when previous is 0). Source: `/compare` (`current` + `previous`).
   Desktop `md:grid-cols-4`, mobile `grid-cols-2`.
3. **Sales-breakdown waterfall** — Gross − Discount = Net, + Subsidy. Styled rows (not a
   chart; mirrors Go). Source: `/compare.current`.
4. **Sales-by-day chart** — `SalesChart.svelte` (Chart.js line, bar toggle optional later).
   Source: `/sales-by-day` (array of `{day, revenue, orders, items}`).
5. **Composition donut** — `Donut.svelte` (Chart.js doughnut) of top menus' revenue share.
   Source: `/top-menus`.
6. **Heatmap** — `Heatmap.svelte`, 7×24 CSS grid, opacity/colour scaled to revenue.
   Source: `/heatmap` (`{dow, hour, revenue, orders}`). Chart.js has no native heatmap;
   a CSS grid matches the Go approach with zero extra deps.
7. **Top menus** — list (`Card` + rows): name · qty · revenue. Source: `/top-menus`.
8. **Subsidies by program** — list; hidden when empty. Source: `/subsidies`.

Desktop arranges charts/sections in a 2-col grid (`md:grid-cols-2`); mobile single column.

### 3. Chart components (isolated, client-only, Chart.js)

- `src/lib/components/charts/SalesChart.svelte` — props `{ points }`. `onMount`:
  create `<canvas>` Chart (line); `$effect` updates data on prop change; `onDestroy`
  calls `chart.destroy()`. Never instantiated during SSR.
- `src/lib/components/charts/Donut.svelte` — props `{ items }`, doughnut. Same lifecycle.
- `src/lib/components/charts/Heatmap.svelte` — pure Svelte/CSS grid (no Chart.js).
- `src/lib/components/charts/Waterfall.svelte` — pure Svelte rows (no Chart.js).
- A tiny shared `chartTheme.ts` maps iOS CSS-var colours into Chart.js options so charts
  match the palette (fonts, grid lines, THB tick formatting).

### Data flow

`+page.svelte` holds `range` state (from preset) → on change, `Promise.all` fetches the
five endpoints through the proxy → stores typed results in `$state` → passes plain data
props into chart components. Money arrives as THB numbers already (backend divides satang
by 100 for dashboard JSON); display formats with the existing `baht()` helper. No money
math in JS beyond formatting.

### Loading / error / empty

- Page-level `Spinner` on first load; per-refetch keep last data, show a subtle loading state.
- On any fetch failure: `EmptyState` ("Couldn't load data") with a retry.
- Empty datasets: charts render an `EmptyState`/"No sales in this period" instead of a blank canvas (mirrors Go's `#sales-empty`).

## Testing

- `svelte-check` clean; Prettier/ESLint pass.
- Component tests (vitest-browser-svelte) for: KPI delta math (incl. divide-by-zero →
  "no prior"), preset→range computation, Heatmap/Waterfall render from sample data.
- Chart components: smoke test that they mount without throwing given sample + empty data
  (Chart.js instance created/destroyed); deep canvas assertions out of scope.
- Manual verification at two viewports (phone ~390px, desktop ≥1024px) against prod data.

## Risks

- **SSR + Chart.js**: Chart.js touches `window`/`canvas`. Mitigation: instantiate only in
  `onMount`; import Chart.js lazily inside the component. Blast radius if wrong = the page
  errors on the server — caught early by `svelte-check` + a render smoke test.
- **Bundle size**: Chart.js (~150–200KB) added to a phone-first app. Accepted (user choice);
  mitigated by registering only the controllers used (line, doughnut) via Chart.js tree-shakeable API.

## Out of scope / later

- Custom (non-preset) date range picker.
- Retiring Go pages + re-gating `/api/dashboard/*` (see `mulan/TODO.md`).
