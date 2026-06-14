# Design — Orders .xlsx export (client-side)

**Date:** 2026-06-14
**Repo:** `mulan-manager` (SvelteKit). Frontend-only. No backend change.

## Problem

The `/orders` page lists orders but can't be exported. The manager wants to download
the orders matching the **current filter** (date range + status) as an `.xlsx`,
including orders beyond the currently-loaded page.

## Goal

An "Export .xlsx" button on `/orders` that downloads one row per order (matching the
active filter) as an Excel file generated in the browser.

## Non-goals

- No line-item detail rows (one row per order only).
- No server-side endpoint, no backend change.
- No CSV/PDF, no scheduled export.

## Constraints / facts

- `/orders` already holds `range()` (custom From/To overrides preset) and `status`
  state, and calls `listOrders({from,to,status,limit,offset})` (`src/lib/api/reports.ts`).
- The backend caps `limit` at 200 → exporting all matching rows requires looping
  offsets until `total` is reached.
- Money fields (`gross/discount/subsidy/net`) arrive as **THB numbers**; `created_at`
  is an ISO string; `points_earned`/`qty` are integers.
- Library: **`write-excel-file`** (browser build, declarative schema, triggers the
  download). Add as a dependency.

## Architecture (small, isolated units)

### 1. `listAllOrders(query)` — in `src/lib/api/reports.ts`

Fetches every order matching the filter by looping `listOrders` with `limit=200`,
incrementing `offset` by the returned page length until `accumulated.length >= total`
(or a page returns empty). Returns `OrderRow[]`. Guards against infinite loop: stop if
a page returns 0 rows. Signature: `listAllOrders(q: Omit<OrdersQuery,'limit'|'offset'>): Promise<OrderRow[]>`.

### 2. `ordersToRows(orders)` — pure, in `src/lib/export/ordersXlsx.ts`

Maps `OrderRow[]` → `ExportRow[]` where

```ts
interface ExportRow {
	date: Date; // new Date(created_at)
	code: string;
	status: string;
	member: string; // member_name
	phone: string; // member_phone
	points: number; // points_earned
	items: number; // qty
	gross: number;
	discount: number;
	subsidy: number;
	net: number;
}
```

Unit-tested (pure).

### 3. `exportOrdersXlsx(orders, fileName)` — browser-only, in `src/lib/export/ordersXlsx.ts`

Builds the `write-excel-file` schema (columns below) from `ordersToRows(orders)` and
calls `writeXlsxFile(rows, { schema, fileName })`. Schema column types/formats:

| Column   | type   | format             | width |
| -------- | ------ | ------------------ | ----- |
| Date     | Date   | `dd/mm/yyyy hh:mm` | 16    |
| Code     | String | —                  | 12    |
| Status   | String | —                  | 8     |
| Member   | String | —                  | 16    |
| Phone    | String | —                  | 14    |
| Points   | Number | `0`                | 8     |
| Items    | Number | `0`                | 6     |
| Gross    | Number | `#,##0.00`         | 12    |
| Discount | Number | `#,##0.00`         | 12    |
| Subsidy  | Number | `#,##0.00`         | 12    |
| Net      | Number | `#,##0.00`         | 12    |

### 4. Page wiring — `src/routes/(app)/orders/+page.svelte`

- An "Export .xlsx" button beside the `loaded / total` line. Disabled when
  `orders.length === 0` or `exporting`.
- On click: `exporting = true` → `listAllOrders({ from, to, status: status || undefined })`
  using the same `range()`/`status` the page applied → `exportOrdersXlsx(all, fileName)`
  → `exporting = false`. Filename: `orders-<from>-to-<to>[-<status>].xlsx` (status segment
  omitted when "All"). Errors → `showToast(message, 'error')`.

## Data flow

Button → `listAllOrders` (loops endpoint, all pages) → `exportOrdersXlsx` →
`ordersToRows` (pure) → `write-excel-file` schema → browser download. Money stays a
number end-to-end; Excel formats display. No new fetch logic on the backend.

## Error handling

- Fetch failure mid-loop → throw → caught at the button handler → toast; `exporting`
  reset in `finally`.
- Empty result → button disabled (can't click); defensive: `exportOrdersXlsx` on an
  empty array still produces a header-only file (acceptable, but the button guard
  prevents it).

## Testing

- `ordersToRows` pure unit test (`*.spec.ts`): maps fields, `created_at`→Date,
  member/phone passthrough, numbers preserved.
- `listAllOrders` paginator: unit test by stubbing `globalThis.fetch` to return two
  pages + a total, assert it accumulates all rows and stops.
- `exportOrdersXlsx` / download: verified manually (browser-only lib; node can't assert
  the binary meaningfully). Schema construction can be smoke-checked by importing it.
- Manual: click Export with a filter set, open the file, confirm rows match the filter
  and money columns are numeric.

## Out of scope / later

- Line-item detail sheet, CSV, server-side export.
