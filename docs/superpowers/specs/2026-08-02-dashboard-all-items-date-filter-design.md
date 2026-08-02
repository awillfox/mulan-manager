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
   explicit.
2. **Custom is a 5th segment.** The segmented control gains a `Custom` option
   that reveals From/To date inputs. Presets stay one tap. The resolved range
   drives *every* dashboard call, not just the items list — one period per screen.
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

- Widen `Preset` to `'today' | '7d' | '30d' | '90d' | 'custom'` and add
  `type FixedPreset = Exclude<Preset, 'custom'>`.
- Re-key `PRESET_DAYS` as `Record<FixedPreset, number>` and narrow
  `presetRange(preset: FixedPreset, today: Date)` — `'custom'` has no day count,
  so the type system, not a runtime check, keeps it out.
- Add `MAX_RANGE_DAYS = 366`.
- Add:

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

- `presets` array gains `{ label: 'Custom', value: 'custom' }`.
- New state: `customFrom` / `customTo`, both initialised to the current 7D range
  so switching to Custom starts from something sensible rather than blank.
- The load `$effect` resolves the active range:
  - `preset === 'custom'` → `customRange(customFrom, customTo)`; if `null`, set a
    `rangeError` message and return without fetching (leaving the previous data
    on screen).
  - otherwise → `presetRange(preset as FixedPreset, new Date())`, clearing
    `rangeError`.
- When `preset === 'custom'`, render a row of two `<input type="date">` bound to
  `customFrom` / `customTo`, labelled From and To, styled with existing tokens
  (`--ios-card`, `--ios-separator`, `--ios-label`) and ≥44px tall.
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
4. Pick a Custom range spanning ~6 months; confirm data loads (no 400) and the
   KPI cards, charts, and list all reflect that range.
5. Set To earlier than From; confirm the inline message appears and no request
   fires.

## Out of scope

- Search or sort controls on the items list.
- Pagination or virtualisation.
- Re-gating `/api/dashboard/*` behind owner auth (tracked by the existing comment
  in `../mulan/main.go`).
- Exporting the items list.
