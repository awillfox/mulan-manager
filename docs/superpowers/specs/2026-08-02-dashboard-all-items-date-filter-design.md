# Dashboard: all items list + custom date filter

**Date:** 2026-08-02
**Status:** Approved, pending implementation

## Problem

The Dashboard's "Top items" section is capped at 10 rows because it renders
`data.topMenus`, which comes from `GET /api/dashboard/top-menus` — a query with a
hardcoded `LIMIT 10`. Users want to see *every* item sold in the selected period.

Separately, the only way to pick a period is the four presets (Today / 7D / 30D /
90D). There is no way to look at an arbitrary date range.

## Decisions

1. **Two endpoints, not one.** `/top-menus` stays at `LIMIT 10` and keeps feeding
   the "Item mix" donut. A new `/menu-items` endpoint returns the unlimited list
   for the section below. Rejected: sharing one unlimited response and slicing
   client-side for the donut — separate endpoints keep each consumer's contract
   explicit. Implementation detail: rather than a second SQL query and a copied
   service method, the two endpoints share the existing query with its `LIMIT`
   turned into a nullable parameter (`LIMIT NULL` = unbounded in Postgres),
   behind shared `menuSales` / `menuList` helpers. The two endpoints remain
   separate at the route level, which is what this decision requires.
2. **Always-visible From/To row, not a 5th segment.** Mid-implementation this
   was changed from the originally planned `Custom` segment (which would have
   revealed date inputs only when selected) to a `from → to` date row that is
   always visible below the segmented control, matching the pre-existing
   idiom already used in `src/routes/(app)/orders/+page.svelte`. Consistency
   with that existing pattern was the reason for the change. Setting **both**
   dates overrides the preset for every dashboard call; clearing **either**
   date falls back to the preset window. A `Clear` button resets both fields
   at once. The segmented control keeps its original four presets — there is
   no `Custom` option.
3. **No search or sort controls.** The list renders everything in the existing
   qty-descending order from SQL. YAGNI until a long list actually proves painful.
4. **Raise the range cap to 366 days.** `maxRangeDays` in the Go dashboard
   handler goes from 92 to 366 so a custom picker can cover a year.

## Backend changes (`../mulan`)

### `internal/sql/dashboard.query.sql`

Add a query identical to `TopMenusBySales` but without the `LIMIT`:

```sql
-- name: MenuItemsBySales :many
SELECT oi.name,
       SUM(oi.qty)::bigint              AS qty_sold,
       SUM(oi.price * oi.qty)::bigint   AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid'
  AND o.created_at >= sqlc.arg('from_at')::timestamptz
  AND o.created_at < sqlc.arg('to_at')::timestamptz
GROUP BY oi.name
ORDER BY qty_sold DESC;
```

Then `sqlc generate`.

### `internal/dashboard/service/dashboard.go`

Add `MenuItems(ctx, from, to) ([]TopMenuItem, error)` — a copy of `TopMenus`
calling `MenuItemsBySales`. Reuses the existing `TopMenuItem` struct, so the JSON
shape is identical (`name`, `qty_sold`, `revenue` in THB).

### `internal/dashboard/http/handler.go`

- `maxRangeDays`: `92` → `366`. Update the adjacent comment.
- Add `MenuItems` handler mirroring `TopMenus`.
- Register `r.Get("/menu-items", h.MenuItems)` in `Handler.Routes`.

No `main.go` change: `/dashboard` is mounted as a whole route group (currently in
the deliberately-open pre-auth group).

No mulan-manager proxy change: `ALLOW` in `src/routes/api/[...path]/+server.ts`
already contains the `dashboard` prefix.

## Frontend changes (`mulan-manager`)

### `src/lib/dashboard/range.ts`

- `Preset` is unchanged: `'today' | '7d' | '30d' | '90d'`. There is no
  `'custom'` member and no `FixedPreset` alias — those were added during
  implementation for the originally planned segment, then reverted when the
  design changed to the always-visible date row.
- `customRange` and `MAX_RANGE_DAYS = 366` are the only additions to this file.
  Add:

```ts
export function customRange(from: string, to: string): Range | null
```

Returns `null` when either string is empty, when `from > to` (plain string
compare is correct for ISO dates), or when the inclusive span exceeds
`MAX_RANGE_DAYS`. Otherwise returns `{ from, to }`.

### `src/lib/dashboard/range.spec.ts`

Add a `customRange` describe block: valid range passes through; empty from;
empty to; reversed range; exactly 366 days accepted; 367 days rejected.

### `src/lib/dashboard/api.ts`

- `DashboardData` gains `allItems: TopMenu[]`.
- `loadDashboard` adds `get<TopMenu[]>(\`/api/dashboard/menu-items?${qs}\`)` to
  the existing `Promise.all`.

### `src/routes/(app)/+page.svelte`

- `presets` array is unchanged — still the original four presets, no `Custom`
  option.
- New state: `customFrom` / `customTo`, both initialised to `''` (blank), not
  to the current 7D range. Blank is required for the "clearing either falls
  back to the preset" semantics below — a non-blank default would make it
  impossible to tell "user cleared this field" from "field never touched".
- A `from → to` row of two `<input type="date">` bound to `customFrom` /
  `customTo` is always visible below the segmented control (not conditional
  on any preset), styled with existing tokens (`--ios-card`, `--ios-separator`,
  `--ios-label`) and matching the idiom already used in
  `src/routes/(app)/orders/+page.svelte`. A `Clear` button appears next to the
  inputs whenever either field is non-empty; clicking it resets both
  `customFrom` and `customTo` to `''`.
- The load `$effect` resolves the active range via `reload()`:
  - Both `customFrom` and `customTo` set → `customRange(customFrom, customTo)`
    overrides the preset. If it returns `null` (reversed order or >366 days),
    set a `rangeError` message and return without fetching, leaving the
    previous state on screen.
  - Either field blank → falls back to `presetRange(preset as Preset, new
    Date())`, clearing `rangeError`. This is the "clearing either falls back
    to the preset" behavior: a custom range only takes effect once both ends
    are filled in, and clearing one end (or hitting `Clear`) immediately
    reverts to the active preset.
- `rangeError`, when set, renders as inline `text-[var(--ios-red)]` text under the inputs
  (e.g. "End date must be on or after the start date." /
  "Range can't exceed 366 days.").
- The section heading "Top items" becomes "All items"; it renders
  `data.allItems` instead of `data.topMenus`, with the same row markup, separator
  logic, and `{name}` / `{qty} · {baht(revenue)}` layout.
- "Item mix" donut is unchanged — still `data.topMenus`.
- The empty-state check for that section switches to `data.allItems.length === 0`.

## Verification

1. `npm run test:unit` — new `customRange` specs pass, existing `presetRange`
   specs unaffected.
2. `npm run check` and `npm run lint` clean.
3. Against the live backend (`BACKEND_URL=http://100.86.43.70:8085`): load the
   dashboard, confirm the All items list is longer than 10 rows on a 90D range
   while the donut still shows at most 10 slices.
4. Fill in both From and To spanning ~6 months; confirm data loads (no 400) and
   the KPI cards, charts, and list all reflect that range, overriding whatever
   preset was previously selected.
5. Set To earlier than From; confirm the inline message appears and no request
   fires. Then clear either field and confirm the dashboard falls back to the
   active preset's window, and that `Clear` resets both fields at once.

## Out of scope

- Search or sort controls on the items list.
- Pagination or virtualisation.
- Re-gating `/api/dashboard/*` behind owner auth (tracked by the existing comment
  in `../mulan/main.go`).
- Exporting the items list.
