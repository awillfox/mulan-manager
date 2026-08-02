# Dashboard All-Items List + Custom Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's 10-row "Top items" section with an unlimited "All items" list, and add a custom date-range filter alongside the Today/7D/30D/90D presets.

**Architecture:** The Go backend (`../mulan`) exposes a second endpoint `GET /dashboard/menu-items` that reuses the menu-sales query with a nullable `LIMIT`, so `/top-menus` keeps feeding the Item mix donut its capped top-10 while the new endpoint returns everything; the handler's range cap rises from 92 to 366 days. The SvelteKit frontend adds a pure `customRange()` validator to the dashboard range module, fetches the new endpoint into `DashboardData.allItems`, and renders an always-visible `from → to` date row — matching the idiom already used by `orders/+page.svelte` — whose resolved range drives every dashboard call.

**Tech Stack:** Go 1.x + chi + sqlc + pgx (backend); SvelteKit 2 + Svelte 5 runes + TypeScript + Tailwind v4 + vitest (frontend).

## Global Constraints

- Two repos are involved: the backend lives at `/home/nate/Dev/mulan`, the frontend at `/home/nate/Dev/mulan-manager`. Commit in each repo separately; never `cd` between them inside one compound command.
- Money crosses the wire as **THB floats** (backend divides satang by 100 at the edge). Display only — never do float math beyond `toFixed(2)`.
- Max range width is **366 days**, expressed as `maxRangeDays = 366` in Go and `MAX_RANGE_DAYS = 366` in TypeScript. These two must stay equal.
- The new endpoint's JSON shape is exactly `{ "name": string, "qty_sold": number, "revenue": number }` — identical to `/top-menus`, so the frontend reuses the existing `TopMenu` type.
- No change to `ALLOW` in `src/routes/api/[...path]/+server.ts` (the `dashboard` prefix already covers `/api/dashboard/menu-items`) and no change to `../mulan/main.go` (the whole `/dashboard` group is already mounted).
- Frontend components follow `src/lib/components/ios/` idiom: semantic tokens from `src/lib/styles/tokens.css`, touch targets ≥44px.
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`) — no Svelte 4 `export let` or reactive `$:`.

---

### Task 1: Raise the dashboard range cap to 366 days

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/dashboard/http/handler.go:15-19` (the `maxRangeDays` const and its comment)
- Test: `/home/nate/Dev/mulan/internal/dashboard/http/range_test.go` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `maxRangeDays = 366` — the ceiling Task 5's `MAX_RANGE_DAYS` must mirror. `rangeFromQuery(r *http.Request) (time.Time, time.Time, error)` keeps its existing signature.

Context: `rangeFromQuery` is an unexported package-level function in `package http` at `internal/dashboard/http/handler.go:53`. It defaults to the shop-local day, reads optional `from`/`to` ISO date query params, treats `to` as inclusive (adds 24h), and errors when `to <= from` or the window exceeds `maxRangeDays`. There is currently no test file in this package.

- [ ] **Step 1: Write the failing test**

Create `/home/nate/Dev/mulan/internal/dashboard/http/range_test.go`:

```go
package http

import (
	"net/http/httptest"
	"testing"
)

func rangeDays(t *testing.T, from, to string) (float64, error) {
	t.Helper()
	req := httptest.NewRequest("GET", "/dashboard/menu-items?from="+from+"&to="+to, nil)
	f, tt, err := rangeFromQuery(req)
	if err != nil {
		return 0, err
	}
	return tt.Sub(f).Hours() / 24, nil
}

func TestRangeFromQueryAcceptsOneYear(t *testing.T) {
	// 2025-08-02..2026-08-01 inclusive = 365 days.
	days, err := rangeDays(t, "2025-08-02", "2026-08-01")
	if err != nil {
		t.Fatalf("expected 365-day range to be accepted, got error: %v", err)
	}
	if days != 365 {
		t.Fatalf("expected 365 days, got %v", days)
	}
}

func TestRangeFromQueryAcceptsExactly366Days(t *testing.T) {
	// 2025-08-02..2026-08-02 inclusive = 366 days, the exact ceiling.
	if _, err := rangeDays(t, "2025-08-02", "2026-08-02"); err != nil {
		t.Fatalf("expected 366-day range to be accepted, got error: %v", err)
	}
}

func TestRangeFromQueryRejects367Days(t *testing.T) {
	// 2025-08-02..2026-08-03 inclusive = 367 days, one past the ceiling.
	if _, err := rangeDays(t, "2025-08-02", "2026-08-03"); err == nil {
		t.Fatal("expected 367-day range to be rejected, got nil error")
	}
}

func TestRangeFromQueryRejectsReversedRange(t *testing.T) {
	if _, err := rangeDays(t, "2026-08-02", "2026-08-01"); err == nil {
		t.Fatal("expected reversed range to be rejected, got nil error")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
go test ./internal/dashboard/http/ -run TestRangeFromQuery -v
```

Working directory: `/home/nate/Dev/mulan`.
Expected: `TestRangeFromQueryAcceptsOneYear` and `TestRangeFromQueryAcceptsExactly366Days` FAIL with "range too large" (the cap is still 92). The other two PASS.

- [ ] **Step 3: Raise the cap**

In `/home/nate/Dev/mulan/internal/dashboard/http/handler.go`, replace the const block:

```go
// maxRangeDays caps how wide a from..to window the dashboard accepts.
// Wider ranges aggregate over the full order_items table and can produce
// hundreds of rows; clamp at the handler so a misbehaving client can't
// pull "all-time" by accident. One year + a leap day, so the manager's
// custom date picker can cover a full year.
const maxRangeDays = 366
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
go test ./internal/dashboard/http/ -run TestRangeFromQuery -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/dashboard/http/handler.go internal/dashboard/http/range_test.go
git commit -m "feat(dashboard): raise range cap from 92 to 366 days"
```

---

### Task 2: Make the menu-sales query's LIMIT a nullable parameter

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/sql/dashboard.query.sql:1-12` (the `TopMenusBySales` block)
- Modify (generated, do not hand-edit): `/home/nate/Dev/mulan/sqlc/dashboard.query.sql.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `(*Queries).TopMenusBySales(ctx context.Context, arg sqlc.TopMenusBySalesParams) ([]sqlc.TopMenusBySalesRow, error)` with `TopMenusBySalesParams` **gaining a third field** `RowLimit pgtype.Int8`. `TopMenusBySalesRow{Name string; QtySold int64; Revenue int64}` is unchanged. Task 3 calls this with `RowLimit` set to 10 for the donut and left invalid (SQL NULL) for the full list. **Revenue is satang (int64)** — the service divides by 100.

Context: sqlc generates Go from `internal/sql/*.query.sql` into the `sqlc` package. `TopMenusBySales` is the only query the dashboard uses for menu sales, and the service is its only caller.

Rather than adding a second near-identical query, parameterise the existing one. **PostgreSQL treats `LIMIT NULL` as "no limit"** — so one query serves both the capped donut feed and the unbounded list. The explicit `::bigint` cast is required: without it sqlc cannot infer a type for the parameter and generates `interface{}`.

- [ ] **Step 1: Parameterise the LIMIT**

Replace the `TopMenusBySales` block at the top of `/home/nate/Dev/mulan/internal/sql/dashboard.query.sql` with:

```sql
-- name: TopMenusBySales :many
-- row_limit NULL means "no limit" (Postgres treats LIMIT NULL as unbounded):
-- the dashboard's item-mix donut passes 10, the "All items" list passes NULL.
SELECT oi.name,
       SUM(oi.qty)::bigint              AS qty_sold,
       SUM(oi.price * oi.qty)::bigint   AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid'
  AND o.created_at >= sqlc.arg('from_at')::timestamptz
  AND o.created_at < sqlc.arg('to_at')::timestamptz
GROUP BY oi.name
ORDER BY qty_sold DESC
LIMIT sqlc.narg('row_limit')::bigint;
```

- [ ] **Step 2: Run codegen**

```bash
cd /home/nate/Dev/mulan
sqlc generate
```

(Equivalent: `task sqlcgen`.) Expected: exits 0, no output.

- [ ] **Step 3: Verify the generated param type**

```bash
cd /home/nate/Dev/mulan
grep -n "type TopMenusBySalesParams" -A 6 sqlc/dashboard.query.sql.go
```

Expected: the struct now has three fields — `FromAt pgtype.Timestamptz`, `ToAt pgtype.Timestamptz`, and `RowLimit pgtype.Int8`.

If sqlc instead generated `RowLimit interface{}` or `RowLimit int64`, STOP and report it — the rest of the plan assumes `pgtype.Int8`, whose zero value is SQL NULL.

- [ ] **Step 4: Verify the build still passes**

```bash
cd /home/nate/Dev/mulan
go build ./...
```

Expected: exits 0. The existing `TopMenus` call site uses a **keyed** struct literal, and Go lets keyed literals omit fields — so `RowLimit` silently zero-values to `pgtype.Int8{Valid: false}`, i.e. SQL NULL. The build stays green, but `TopMenus` is transiently unbounded until Task 3 sets the limit at that call site. Do **not** patch `internal/dashboard/service/dashboard.go` here; that is Task 3's work.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/sql/dashboard.query.sql sqlc/dashboard.query.sql.go
git commit -m "feat(dashboard): make menu-sales LIMIT a nullable parameter"
```

Note: this commit compiles but leaves `TopMenus` transiently unbounded, because nothing sets `RowLimit` yet. Task 3 restores the cap in the very next commit. Do not deploy this commit in isolation.

---

### Task 3: Share one mapping helper between TopMenus and MenuItems

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/dashboard/service/dashboard.go:177-193` (replace the body of `TopMenus`; add `menuSales` and `MenuItems`)

**Interfaces:**
- Consumes: `sqlc.TopMenusBySalesParams` (now with `RowLimit pgtype.Int8`) from Task 2.
- Produces:
  - `(*DashboardService).TopMenus(ctx context.Context, from, to time.Time) ([]TopMenuItem, error)` — unchanged signature, still capped at 10.
  - `(*DashboardService).MenuItems(ctx context.Context, from, to time.Time) ([]TopMenuItem, error)` — same signature, unbounded.

  Both share the unexported `menuSales` helper. Task 4's handlers call both. `TopMenuItem` already exists at `internal/dashboard/service/dashboard.go:46` as `{Name string \`json:"name"\`; QtySold int64 \`json:"qty_sold"\`; Revenue float64 \`json:"revenue"\`}` and is reused unchanged — that is what keeps the two endpoints' JSON identical.

Context: `DashboardService` holds `s.q`, the sqlc `*Queries`. The current `TopMenus` (line 177) does the query call plus a satang→THB mapping loop. Both of those move into `menuSales`, leaving `TopMenus` and `MenuItems` as one-line wrappers that differ only in the limit they pass. This is the de-duplication the human partner ruled for over copying the method.

`pgtype.Int8{}` (zero value, `Valid: false`) marshals to SQL NULL, which is what makes `MenuItems` unbounded.

- [ ] **Step 1: Replace TopMenus with the shared helper plus two wrappers**

In `/home/nate/Dev/mulan/internal/dashboard/service/dashboard.go`, replace the whole `TopMenus` function with:

```go
// menuSales aggregates paid order items by name over [from, to), newest
// sales included, ordered by quantity descending. A rowLimit that is not
// Valid means SQL NULL, which Postgres reads as "no limit".
func (s *DashboardService) menuSales(ctx context.Context, from, to time.Time, rowLimit pgtype.Int8) ([]TopMenuItem, error) {
	rows, err := s.q.TopMenusBySales(ctx, sqlc.TopMenusBySalesParams{
		FromAt:   pgtype.Timestamptz{Time: from, Valid: true},
		ToAt:     pgtype.Timestamptz{Time: to, Valid: true},
		RowLimit: rowLimit,
	})
	if err != nil {
		return nil, fmt.Errorf("menu sales: %w", err)
	}
	out := make([]TopMenuItem, len(rows))
	for i, r := range rows {
		out[i] = TopMenuItem{
			Name:    r.Name,
			QtySold: r.QtySold,
			Revenue: float64(r.Revenue) / 100,
		}
	}
	return out, nil
}

// topMenusLimit is how many items the dashboard's item-mix donut shows.
// More slices than this stops being readable on a phone.
const topMenusLimit = 10

// TopMenus backs the dashboard's item-mix donut.
func (s *DashboardService) TopMenus(ctx context.Context, from, to time.Time) ([]TopMenuItem, error) {
	return s.menuSales(ctx, from, to, pgtype.Int8{Int64: topMenusLimit, Valid: true})
}

// MenuItems backs the dashboard's "All items" list: every item sold in the
// window, no cap.
func (s *DashboardService) MenuItems(ctx context.Context, from, to time.Time) ([]TopMenuItem, error) {
	return s.menuSales(ctx, from, to, pgtype.Int8{})
}
```

No new imports: `fmt`, `pgtype`, `sqlc`, and `time` are all already imported by this file.

- [ ] **Step 2: Verify the build and the restored cap**

```bash
cd /home/nate/Dev/mulan
go build ./... && go vet ./internal/dashboard/...
```

Expected: both exit 0, no output.

Task 2 left `TopMenus` transiently unbounded — its call site omitted the new `RowLimit` field, which Go zero-values to SQL NULL. Setting `RowLimit: pgtype.Int8{Int64: topMenusLimit, Valid: true}` in the `TopMenus` wrapper above is what restores the cap of 10. Confirm that literal is present and `Valid: true`.

- [ ] **Step 3: Verify no LIMIT literal remains in Go or SQL**

```bash
cd /home/nate/Dev/mulan
grep -rn "LIMIT 10" internal/sql/dashboard.query.sql sqlc/dashboard.query.sql.go
```

Expected: no matches (exit status 1). The cap now lives only in `topMenusLimit`.

- [ ] **Step 4: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/dashboard/service/dashboard.go
git commit -m "feat(dashboard): add MenuItems, sharing one query helper with TopMenus"
```

---

### Task 4: Expose GET /dashboard/menu-items

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/dashboard/http/handler.go` (add to `Handler.Routes` at lines 39-46; replace `TopMenus` at lines 129-141 and add `MenuItems`)
- Test: `/home/nate/Dev/mulan/internal/dashboard/http/range_test.go` (extend the file created in Task 1)

**Interfaces:**
- Consumes: `(*DashboardService).TopMenus` and `.MenuItems` from Task 3; `rangeFromQuery` from Task 1.
- Produces: `GET /api/dashboard/menu-items?from=YYYY-MM-DD&to=YYYY-MM-DD`, responding `{"data": [{"name": string, "qty_sold": number, "revenue": number}]}`. Task 6's frontend client calls this path.

Context: `Handler.Routes(r chi.Router)` at line 39 registers the dashboard's GET routes. `response.OK(w, r, out)` wraps the payload in the `{data, error}` envelope; `response.Error(w, r, status, msg, err)` produces the error side.

Both endpoints do exactly the same thing — parse the range, call a service method with the signature `func(context.Context, time.Time, time.Time) ([]service.TopMenuItem, error)`, envelope the result. Per the human partner's de-duplication ruling, that shared shape becomes `menuList`, and the two handlers are one-line wrappers differing only in the service method and the error message.

- [ ] **Step 1: Write the failing test**

Append to `/home/nate/Dev/mulan/internal/dashboard/http/range_test.go`:

```go
func TestRoutesRegistersMenuItems(t *testing.T) {
	h := NewHandler(nil)
	r := chi.NewRouter()
	r.Route("/dashboard", h.Routes)

	found := false
	_ = chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if method == "GET" && route == "/dashboard/menu-items" {
			found = true
		}
		return nil
	})
	if !found {
		t.Fatal("expected GET /dashboard/menu-items to be registered")
	}
}

func TestMenuListRejectsBadRange(t *testing.T) {
	h := NewHandler(nil)
	// to before from: menuList must 400 out of rangeFromQuery before it
	// touches the (nil) service, so this exercises the shared error path.
	req := httptest.NewRequest("GET", "/dashboard/menu-items?from=2026-08-02&to=2026-08-01", nil)
	w := httptest.NewRecorder()
	h.MenuItems(w, req)
	if w.Code != 400 {
		t.Fatalf("expected 400 for reversed range, got %d", w.Code)
	}
}
```

Extend that file's import block to:

```go
import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)
```

Note: passing `nil` for the service is safe in both tests — the first only walks the route table, and the second returns at the range check before dereferencing it.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/nate/Dev/mulan
go test ./internal/dashboard/http/ -run "TestRoutesRegistersMenuItems|TestMenuListRejectsBadRange" -v
```

Expected: both FAIL — the first with "expected GET /dashboard/menu-items to be registered", the second with a compile error (`h.MenuItems` undefined). A compile failure counts as red here.

- [ ] **Step 3: Extract menuList and add both wrappers**

In `/home/nate/Dev/mulan/internal/dashboard/http/handler.go`, add to `Handler.Routes` after the `/top-menus` line:

```go
	r.Get("/menu-items", h.MenuItems)
```

Replace the existing `TopMenus` handler with:

```go
// menuList serves an aggregated menu-sales list: parse the window, call
// load, envelope the result. Shared by TopMenus and MenuItems, which
// differ only in whether the list is capped.
func (h *Handler) menuList(
	w http.ResponseWriter,
	r *http.Request,
	load func(context.Context, time.Time, time.Time) ([]service.TopMenuItem, error),
	failMsg string,
) {
	from, to, err := rangeFromQuery(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error(), err)
		return
	}
	items, err := load(r.Context(), from, to)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, failMsg, err)
		return
	}
	response.OK(w, r, items)
}

// TopMenus returns the capped list behind the dashboard's item-mix donut.
func (h *Handler) TopMenus(w http.ResponseWriter, r *http.Request) {
	h.menuList(w, r, h.svc.TopMenus, "failed to load top menus")
}

// MenuItems returns every item sold in the window, behind the dashboard's
// "All items" list.
func (h *Handler) MenuItems(w http.ResponseWriter, r *http.Request) {
	h.menuList(w, r, h.svc.MenuItems, "failed to load menu items")
}
```

Add `"context"` to the file's import block (it is not currently imported). `service` and `time` already are.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/nate/Dev/mulan
go test ./internal/dashboard/... -v && go build ./... && go vet ./internal/dashboard/...
```

Expected: all six tests in the package PASS; build and vet exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/dashboard/http/handler.go internal/dashboard/http/range_test.go
git commit -m "feat(dashboard): expose GET /dashboard/menu-items via shared menuList"
```
---

### Task 5: Add customRange() to the frontend range module

**Files:**
- Modify: `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.ts`
- Test: `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.spec.ts`

**Interfaces:**
- Consumes: `maxRangeDays = 366` from Task 1 (mirrored, not imported — separate repos).
- Produces, all from `$lib/dashboard/range`:
  - `type Preset = 'today' | '7d' | '30d' | '90d' | 'custom'`
  - `type FixedPreset = Exclude<Preset, 'custom'>`
  - `presetRange(preset: FixedPreset, today: Date): Range` (narrowed from `Preset`)
  - `customRange(from: string, to: string): Range | null`
  - `MAX_RANGE_DAYS = 366`
  - `Range` is unchanged: `{ from: string; to: string }`, both inclusive ISO `yyyy-mm-dd`.

  Task 7's page component imports `presetRange`, `customRange`, and `type FixedPreset`.

Context: `range.ts` today exports `Preset`, `Range`, and `presetRange`, plus a private `isoDay(d: Date)` helper. `presetRange` is already spec'd in `range.spec.ts` against a fixed `new Date(2026, 5, 14)`. ISO `yyyy-mm-dd` strings compare correctly with `<` / `>`, so `customRange` needs no `Date` parsing for the ordering check — only for the span.

- [ ] **Step 1: Write the failing tests**

Append to `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.spec.ts`:

```ts
describe('customRange', () => {
	it('passes a valid range through unchanged', () => {
		expect(customRange('2026-06-01', '2026-06-14')).toEqual({
			from: '2026-06-01',
			to: '2026-06-14'
		});
	});
	it('accepts a single day', () => {
		expect(customRange('2026-06-14', '2026-06-14')).toEqual({
			from: '2026-06-14',
			to: '2026-06-14'
		});
	});
	it('rejects an empty from', () => {
		expect(customRange('', '2026-06-14')).toBeNull();
	});
	it('rejects an empty to', () => {
		expect(customRange('2026-06-01', '')).toBeNull();
	});
	it('rejects a reversed range', () => {
		expect(customRange('2026-06-14', '2026-06-01')).toBeNull();
	});
	it('accepts exactly 366 inclusive days', () => {
		// 2025-08-02..2026-08-02 inclusive = 366 days.
		expect(customRange('2025-08-02', '2026-08-02')).toEqual({
			from: '2025-08-02',
			to: '2026-08-02'
		});
	});
	it('rejects 367 inclusive days', () => {
		expect(customRange('2025-08-02', '2026-08-03')).toBeNull();
	});
});
```

Change the file's import line to:

```ts
import { presetRange, customRange } from './range';
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /home/nate/Dev/mulan-manager
npx vitest run src/lib/dashboard/range.spec.ts
```

Expected: FAIL — vitest reports `customRange is not a function` (or an import resolution error) for all seven new cases.

- [ ] **Step 3: Implement `customRange` and narrow `presetRange`**

Replace the top of `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.ts` down to and including the `PRESET_DAYS` line with:

```ts
export type Preset = 'today' | '7d' | '30d' | '90d' | 'custom';
/** The presets that map to a fixed number of days back from today. */
export type FixedPreset = Exclude<Preset, 'custom'>;
export interface Range {
	from: string; // inclusive ISO yyyy-mm-dd (shop-local)
	to: string; // inclusive ISO yyyy-mm-dd
}

/** Mirrors maxRangeDays in ../mulan/internal/dashboard/http/handler.go. */
export const MAX_RANGE_DAYS = 366;

const PRESET_DAYS: Record<FixedPreset, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };
```

Change the `presetRange` signature to take `FixedPreset`:

```ts
export function presetRange(preset: FixedPreset, today: Date): Range {
```

(its body is unchanged) and append:

```ts
/**
 * Validates a user-entered custom range. Returns null — meaning "don't
 * fetch" — when either date is blank, the order is reversed, or the
 * inclusive span exceeds what the backend accepts. ISO yyyy-mm-dd strings
 * order correctly under plain string comparison.
 */
export function customRange(from: string, to: string): Range | null {
	if (!from || !to) return null;
	if (from > to) return null;
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
	if (days > MAX_RANGE_DAYS) return null;
	return { from, to };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/nate/Dev/mulan-manager
npx vitest run src/lib/dashboard/range.spec.ts
```

Expected: all 11 tests PASS (4 pre-existing `presetRange` + 7 new `customRange`).

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan-manager
git add src/lib/dashboard/range.ts src/lib/dashboard/range.spec.ts
git commit -m "feat(dashboard): add customRange validator and custom preset"
```

---

### Task 6: Fetch the all-items list in the dashboard client

**Files:**
- Modify: `/home/nate/Dev/mulan-manager/src/lib/dashboard/api.ts`

**Interfaces:**
- Consumes: `GET /api/dashboard/menu-items` from Task 4; `Range` from Task 5.
- Produces: `DashboardData` gains `allItems: TopMenu[]`. Task 7's page reads `data.allItems`. `TopMenu` (in `src/lib/dashboard/types.ts`) is reused unchanged: `{ name: string; qty_sold: number; revenue: number }`.

Context: `loadDashboard(range)` builds one query string and issues five parallel `get<T>()` calls through `Promise.all`, each unwrapping the `{data, error}` envelope. Adding a sixth is a two-line change. No test: this module is a thin fetch wrapper with no logic worth mocking, and it is covered end-to-end in Task 8.

- [ ] **Step 1: Add `allItems` to the interface**

In `/home/nate/Dev/mulan-manager/src/lib/dashboard/api.ts`, extend `DashboardData`:

```ts
export interface DashboardData {
	compare: CompareResult;
	salesByDay: DayPoint[];
	heatmap: HeatmapCell[];
	topMenus: TopMenu[];
	allItems: TopMenu[];
	subsidies: SubsidyProgram[];
}
```

- [ ] **Step 2: Fetch it**

Replace the body of `loadDashboard` with:

```ts
export async function loadDashboard(range: Range): Promise<DashboardData> {
	const qs = `from=${range.from}&to=${range.to}`;
	const [compare, salesByDay, heatmap, topMenus, allItems, subsidies] = await Promise.all([
		get<CompareResult>(`/api/dashboard/compare?${qs}`),
		get<DayPoint[]>(`/api/dashboard/sales-by-day?${qs}`),
		get<HeatmapCell[]>(`/api/dashboard/heatmap?${qs}`),
		get<TopMenu[]>(`/api/dashboard/top-menus?${qs}`),
		get<TopMenu[]>(`/api/dashboard/menu-items?${qs}`),
		get<SubsidyProgram[]>(`/api/dashboard/subsidies?${qs}`)
	]);
	return { compare, salesByDay, heatmap, topMenus, allItems, subsidies };
}
```

The destructured order must match the `Promise.all` array order — `allItems` sits between `topMenus` and `subsidies` in both.

- [ ] **Step 3: Verify types**

```bash
cd /home/nate/Dev/mulan-manager
npm run check
```

Expected: 0 errors. (Warnings unrelated to these files may pre-exist; only new errors matter.)

- [ ] **Step 4: Commit**

```bash
cd /home/nate/Dev/mulan-manager
git add src/lib/dashboard/api.ts
git commit -m "feat(dashboard): fetch unlimited menu items into DashboardData"
```

---

### Task 7: Render the date-range row and All items list

**Files:**
- Modify: `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.ts` (revert the `Preset` widening)
- Modify: `/home/nate/Dev/mulan-manager/src/routes/(app)/+page.svelte`

**Interfaces:**
- Consumes: `presetRange`, `customRange`, `MAX_RANGE_DAYS`, `type Preset`, `type Range` from Task 5; `DashboardData.allItems` from Task 6.
- Produces: the finished UI. Nothing downstream depends on it.

**Design change from the original plan — read this before you start.**

The original plan added a fifth `Custom` segment that revealed the date inputs. That was written without knowing that `src/routes/(app)/orders/+page.svelte` **already implements this exact feature** with a different, established idiom. The human partner ruled that the Dashboard must match Orders rather than invent a second pattern. So:

- **No `Custom` segment.** The presets array stays at four entries.
- The date row is **always visible**, sitting directly under the segmented control.
- Setting **both** dates overrides the preset; clearing either falls back to the preset.
- A `Clear` button appears when either date is set.

Read `src/routes/(app)/orders/+page.svelte` (its `presets`, `range()`, the `$effect` around line 105, and the date-row markup around line 119) before writing anything. That file is your reference for markup, class strings, and comment idiom. Match it.

Because there is no longer a `'custom'` preset value, the `Preset` union widening and the `FixedPreset` alias added in Task 5 are now dead — this task removes them. That is also what repairs the two `npm run check` errors currently outstanding in `+page.svelte` and `orders/+page.svelte`: reverting the narrowing fixes both call sites without editing `orders/+page.svelte` at all. **Do not edit `orders/+page.svelte`.**

`customRange` and `MAX_RANGE_DAYS` stay exactly as Task 5 built them — only the `Preset`/`FixedPreset` change is reverted.

- [ ] **Step 1: Revert the Preset widening in range.ts**

In `/home/nate/Dev/mulan-manager/src/lib/dashboard/range.ts`, restore the original union and drop the alias:

```ts
export type Preset = 'today' | '7d' | '30d' | '90d';
```

Delete the `FixedPreset` line entirely. Change `PRESET_DAYS` back to `Record<Preset, number>` and `presetRange`'s signature back to:

```ts
export function presetRange(preset: Preset, today: Date): Range {
```

Leave `Range`, `MAX_RANGE_DAYS`, `isoDay`, the `PRESET_DAYS` values, and all of `customRange` untouched.

- [ ] **Step 2: Verify the type errors are gone and the specs still pass**

```bash
cd /home/nate/Dev/mulan-manager
npm run check && npx vitest run src/lib/dashboard/range.spec.ts
```

Expected: `check` reports **0 errors** (both the `+page.svelte` and `orders/+page.svelte` `FixedPreset` errors disappear), and all 11 range specs still PASS. If `orders/+page.svelte` still errors, stop — you reverted something incompletely.

- [ ] **Step 3: Rewrite the dashboard page's script block**

In `/home/nate/Dev/mulan-manager/src/routes/(app)/+page.svelte`, change the range import to:

```ts
	import {
		presetRange,
		customRange,
		MAX_RANGE_DAYS,
		type Preset,
		type Range
	} from '$lib/dashboard/range';
```

Leave the `presets` array at its existing four entries — do not add a fifth.

Replace the state declarations and the `load`/`$effect` block with:

```ts
	let preset = $state('7d');
	let customFrom = $state('');
	let customTo = $state('');
	let rangeError = $state('');
	let data = $state<DashboardData | null>(null);
	let loading = $state(true);
	let errored = $state(false);

	async function load(range: Range) {
		loading = true;
		errored = false;
		try {
			data = await loadDashboard(range);
		} catch {
			errored = true;
		} finally {
			loading = false;
		}
	}

	// Resolve the active window: a complete custom range wins over the preset.
	// An invalid one explains itself and leaves the last good data on screen
	// rather than blanking the dashboard mid-edit.
	function reload() {
		if (customFrom && customTo) {
			const range = customRange(customFrom, customTo);
			if (!range) {
				rangeError =
					customFrom > customTo
						? 'End date must be on or after the start date.'
						: `Range can't exceed ${MAX_RANGE_DAYS} days.`;
				loading = false;
				return;
			}
			rangeError = '';
			load(range);
			return;
		}
		rangeError = '';
		load(presetRange(preset as Preset, new Date()));
	}

	// Refetch whenever any filter changes. Read each dep explicitly so the effect
	// tracks them. customFrom/customTo only take effect once BOTH are set.
	$effect(() => {
		void preset;
		void customFrom;
		void customTo;
		reload();
	});
```

Note `load` now takes a resolved `Range` rather than a preset string. The `void`-then-call pattern and its comment are lifted from `orders/+page.svelte` deliberately — keep them.

- [ ] **Step 4: Add the date row markup**

Immediately after `<SegmentedControl options={presets} bind:value={preset} />`, insert:

```svelte
	<div class="flex items-center gap-2 text-sm">
		<input
			type="date"
			bind:value={customFrom}
			class="rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-1 text-[var(--ios-label)]"
		/>
		<span class="text-[var(--ios-label-secondary)]">→</span>
		<input
			type="date"
			bind:value={customTo}
			class="rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-1 text-[var(--ios-label)]"
		/>
		{#if customFrom || customTo}
			<button
				class="text-[var(--ios-blue)]"
				onclick={() => {
					customFrom = '';
					customTo = '';
				}}>Clear</button
			>
		{/if}
	</div>
	{#if rangeError}
		<p class="px-1 text-sm text-[var(--ios-red)]">{rangeError}</p>
	{/if}
```

The class strings are copied verbatim from the Orders page so the two filters look identical. Do not restyle them.

- [ ] **Step 5: Switch the list to all items**

Replace the "Top items" block with:

```svelte
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">All items</p>
			{#if data.allItems.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No sales yet.</p></Card>
			{:else}
				<Card padded={false}>
					{#each data.allItems as m, i (m.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < data.allItems.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{m.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{m.qty_sold} · {baht(m.revenue)}</span
							>
						</div>
					{/each}
				</Card>
			{/if}
		</div>
```

Leave the "Item mix" `<Donut items={data.topMenus} />` block above it exactly as it is — the donut keeps its capped top-10 feed.

- [ ] **Step 6: Run the Svelte autofixer**

You have a Svelte MCP server available. Run `svelte-autofixer` over the full contents of `src/routes/(app)/+page.svelte` and apply what it reports. Repeat until it returns no issues or suggestions. This catches Svelte 5 rune misuse that `svelte-check` alone can miss.

- [ ] **Step 7: Check, lint, and run the unit suite**

```bash
cd /home/nate/Dev/mulan-manager
npm run format && npm run check && npm run lint && npx vitest run
```

Expected: `check` 0 errors; `lint` clean; all vitest specs PASS.

- [ ] **Step 8: Commit**

```bash
cd /home/nate/Dev/mulan-manager
git add src/lib/dashboard/range.ts "src/routes/(app)/+page.svelte"
git commit -m "feat(dashboard): custom date range and full item list"
```

---

### Task 8: Verify end-to-end against the live backend

**Files:** none modified — this task is verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: confirmation, or a defect report to fix before the work is called done.

Context: the Go backend must be rebuilt and running with the Task 1-4 changes for this to mean anything. The dev server proxies `/api/*` to `BACKEND_URL`. Report actual observed output for each check — do not mark this task complete on the basis of "should work".

- [ ] **Step 1: Rebuild and restart the backend**

Deploy the rebuilt `mulan` binary to coffee-server (`100.86.43.70:8085`) by the project's normal systemd artifact-deploy route, or run it locally against the same database. Confirm the new endpoint answers:

```bash
curl -s "http://100.86.43.70:8085/api/dashboard/menu-items?from=2026-05-01&to=2026-08-01" | head -c 400
```

Expected: a `{"data":[...]}` envelope whose first element has `name`, `qty_sold`, `revenue`.

- [ ] **Step 2: Confirm the list is genuinely unlimited**

```bash
curl -s "http://100.86.43.70:8085/api/dashboard/menu-items?from=2026-05-01&to=2026-08-01" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))"
curl -s "http://100.86.43.70:8085/api/dashboard/top-menus?from=2026-05-01&to=2026-08-01" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))"
```

Expected: the first number exceeds 10 (assuming the shop sells more than 10 distinct items in 3 months); the second is exactly 10. If the first is also 10, widen the range or check the data before concluding the query is wrong.

- [ ] **Step 3: Confirm the 366-day cap moved**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://100.86.43.70:8085/api/dashboard/menu-items?from=2025-09-01&to=2026-08-01"
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://100.86.43.70:8085/api/dashboard/menu-items?from=2025-01-01&to=2026-08-01"
```

Expected: `200` for the ~11-month range, `400` for the ~19-month range.

- [ ] **Step 4: Exercise the UI**

```bash
cd /home/nate/Dev/mulan-manager
BACKEND_URL=http://100.86.43.70:8085 npm run dev
```

Open the dashboard and confirm each of:
- 90D preset: the "All items" list shows more than 10 rows; the "Item mix" donut still shows at most 10 slices.
- The `from → to` date row is visible immediately, below the segmented control, and both fields start blank — there is no `Custom` segment to tap.
- Set both From and To to a range spanning ~6 months back: KPI cards, waterfall, sales chart, heatmap, donut, and the items list all refresh to that range with no error banner, overriding whichever preset was previously selected.
- Set To earlier than From: "End date must be on or after the start date." appears, no good data was on screen already so the dashboard shows the range error alone (not also the "Couldn't load data" empty state), and the Network tab shows **no** new `/api/dashboard/*` requests.
- Set a range wider than 366 days: "Range can't exceed 366 days." appears, again with no request fired.
- Clear just one of the two fields (leaving the other filled): the inline error clears and the dashboard reloads the currently selected preset's window.
- Click **Clear**: both fields reset to blank and the dashboard reloads the currently selected preset's window.

- [ ] **Step 5: Report results**

Write up what actually happened for each check above, quoting the observed numbers and status codes. If anything failed, fix it and re-run the affected checks before marking this task done.

---

## Self-Review

**Spec coverage:**
- Backend unlimited menu-items query → Task 2 ✓ (delivered as a nullable `row_limit` param on `TopMenusBySales` rather than a second query — see the de-duplication ruling below)
- Backend `MenuItems` service method → Task 3 ✓
- Backend `/menu-items` route + handler → Task 4 ✓
- `maxRangeDays` 92 → 366 → Task 1 ✓
- `Preset` widened, `customRange`, `MAX_RANGE_DAYS` → Task 5 ✓
- `customRange` specs (valid / empty from / empty to / reversed / 366 / 367) → Task 5, plus a single-day case ✓
- `DashboardData.allItems` + fetch → Task 6 ✓
- Always-visible date row, `rangeError`, "All items" heading and list, donut untouched → Task 7 ✓ (Custom segment replaced by the Orders-page idiom per the human partner's ruling; the `'custom'` preset value and `FixedPreset` alias from Task 5 are reverted as dead)
- Verification steps 1-5 from the spec → Task 8 ✓
- No proxy `ALLOW` change, no `main.go` change → stated in Global Constraints ✓

**De-duplication ruling (pre-flight):** the human partner ruled that `MenuItems` must NOT be a copy of `TopMenus`. Tasks 2-4 therefore share code at every layer: one SQL query with a nullable `row_limit`, one `menuSales` service helper, one `menuList` handler helper. The two endpoints stay separate at the route level, as the spec requires, but no logic block is duplicated.

**Type consistency:** `TopMenuItem` (Go) and `TopMenu` (TS) are reused, not redefined. `TopMenusBySalesParams` gains exactly one field (`RowLimit pgtype.Int8`) in Task 2 and is constructed with that field in Task 3. `menuSales` and `menuList` are defined and consumed within Tasks 3 and 4 respectively. `MAX_RANGE_DAYS`, `Range`, and `customRange` are defined in Task 5 and consumed under those exact names in Task 7; `FixedPreset` is added in Task 5 and removed again in Task 7, leaving `Preset` at its original four values so `orders/+page.svelte` needs no edit. `load` changes signature from `(p: string)` to `(range: Range)` within a single task (7), so no cross-task mismatch.
