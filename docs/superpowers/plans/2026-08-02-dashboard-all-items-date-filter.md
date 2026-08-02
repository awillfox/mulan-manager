# Dashboard All-Items List + Custom Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's 10-row "Top items" section with an unlimited "All items" list, and add a Custom date-range option alongside the Today/7D/30D/90D presets.

**Architecture:** The Go backend (`../mulan`) gains a second, unlimited menu-items query and endpoint (`GET /dashboard/menu-items`) so the existing `LIMIT 10` `/top-menus` endpoint can keep feeding the Item mix donut untouched, and its range cap rises from 92 to 366 days. The SvelteKit frontend adds a pure `customRange()` validator to the dashboard range module, fetches the new endpoint into `DashboardData.allItems`, and renders a fifth `Custom` segment that reveals two `<input type="date">` fields driving every dashboard call.

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

### Task 2: Add the unlimited MenuItemsBySales query

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/sql/dashboard.query.sql` (append after the `TopMenusBySales` block, which ends at line 12)
- Modify (generated, do not hand-edit): `/home/nate/Dev/mulan/sqlc/dashboard.query.sql.go`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `(*Queries).MenuItemsBySales(ctx context.Context, arg sqlc.MenuItemsBySalesParams) ([]sqlc.MenuItemsBySalesRow, error)`, where `MenuItemsBySalesParams{FromAt, ToAt pgtype.Timestamptz}` and `MenuItemsBySalesRow{Name string; QtySold int64; Revenue int64}`. Task 3 calls this. **Revenue is satang (int64)** — the service divides by 100.

Context: sqlc generates Go from `internal/sql/*.query.sql` into the `sqlc` package. The new query is `TopMenusBySales` verbatim minus its `LIMIT 10`. There is no unit test here — sqlc output is generated code, and the query is exercised end-to-end in Task 8. The verification for this task is that codegen produced the expected symbols and the module still builds.

- [ ] **Step 1: Append the query**

Add to the end of `/home/nate/Dev/mulan/internal/sql/dashboard.query.sql`:

```sql
-- name: MenuItemsBySales :many
-- Same aggregate as TopMenusBySales but unbounded: the manager dashboard's
-- "All items" list shows every item sold in the window, not just the top 10.
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

- [ ] **Step 2: Run codegen**

```bash
cd /home/nate/Dev/mulan
sqlc generate
```

(Equivalent: `task sqlcgen`.) Expected: exits 0, no output.

- [ ] **Step 3: Verify the generated symbols exist**

```bash
cd /home/nate/Dev/mulan
grep -n "func (q \*Queries) MenuItemsBySales\|type MenuItemsBySalesRow\|type MenuItemsBySalesParams" sqlc/dashboard.query.sql.go
```

Expected: three matching lines. Also confirm the generated SQL string has **no** `LIMIT`:

```bash
grep -n "const menuItemsBySales" -A 14 sqlc/dashboard.query.sql.go
```

Expected: the query text ends at `ORDER BY qty_sold DESC` with no `LIMIT` line.

- [ ] **Step 4: Verify the module still builds**

```bash
cd /home/nate/Dev/mulan
go build ./...
```

Expected: exits 0, no output.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/sql/dashboard.query.sql sqlc/dashboard.query.sql.go
git commit -m "feat(dashboard): add unlimited MenuItemsBySales query"
```

---

### Task 3: Add the MenuItems service method

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/dashboard/service/dashboard.go` (insert directly after `TopMenus`, which ends at line 193)

**Interfaces:**
- Consumes: `sqlc.MenuItemsBySalesParams` / `MenuItemsBySalesRow` from Task 2.
- Produces: `(*DashboardService).MenuItems(ctx context.Context, from, to time.Time) ([]TopMenuItem, error)`. Task 4's handler calls this. `TopMenuItem` already exists at `internal/dashboard/service/dashboard.go:46` as `{Name string \`json:"name"\`; QtySold int64 \`json:"qty_sold"\`; Revenue float64 \`json:"revenue"\`}` and is reused unchanged — that is what keeps the new endpoint's JSON identical to `/top-menus`.

Context: `DashboardService` holds `s.q`, the sqlc `*Queries`. `TopMenus` at line 177 is the template — copy its structure exactly, including the `float64(r.Revenue) / 100` satang→THB conversion.

- [ ] **Step 1: Add the method**

Insert into `/home/nate/Dev/mulan/internal/dashboard/service/dashboard.go`, immediately after the closing brace of `TopMenus`:

```go
// MenuItems is TopMenus without the LIMIT: every item sold in the window,
// still ordered by quantity descending. Backs the manager dashboard's
// "All items" list, while TopMenus backs the item-mix donut.
func (s *DashboardService) MenuItems(ctx context.Context, from, to time.Time) ([]TopMenuItem, error) {
	rows, err := s.q.MenuItemsBySales(ctx, sqlc.MenuItemsBySalesParams{
		FromAt: pgtype.Timestamptz{Time: from, Valid: true},
		ToAt:   pgtype.Timestamptz{Time: to, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("menu items: %w", err)
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
```

No new imports: `fmt`, `pgtype`, `sqlc`, and `time` are all already imported by this file.

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/nate/Dev/mulan
go build ./... && go vet ./internal/dashboard/...
```

Expected: both exit 0, no output.

- [ ] **Step 3: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/dashboard/service/dashboard.go
git commit -m "feat(dashboard): add MenuItems service method"
```

---

### Task 4: Expose GET /dashboard/menu-items

**Files:**
- Modify: `/home/nate/Dev/mulan/internal/dashboard/http/handler.go` (add to `Handler.Routes` at line 39-46; add handler method after `TopMenus`, which ends at line 141)
- Test: `/home/nate/Dev/mulan/internal/dashboard/http/range_test.go` (extend the file created in Task 1)

**Interfaces:**
- Consumes: `(*DashboardService).MenuItems` from Task 3; `rangeFromQuery` from Task 1.
- Produces: `GET /api/dashboard/menu-items?from=YYYY-MM-DD&to=YYYY-MM-DD`, responding `{"data": [{"name": string, "qty_sold": number, "revenue": number}]}`. Task 6's frontend client calls this path.

Context: `Handler.Routes(r chi.Router)` at line 39 registers the dashboard's six GET routes. `response.OK(w, r, out)` wraps the payload in the `{data, error}` envelope; `response.Error(w, r, status, msg, err)` produces the error side. `TopMenus` at line 129 is the exact template.

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

Note: this test only walks the route table, so passing `nil` for the service is safe — the handler is never invoked.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/nate/Dev/mulan
go test ./internal/dashboard/http/ -run TestRoutesRegistersMenuItems -v
```

Expected: FAIL with "expected GET /dashboard/menu-items to be registered".

- [ ] **Step 3: Add the handler and register the route**

In `/home/nate/Dev/mulan/internal/dashboard/http/handler.go`, add to `Handler.Routes` after the `/top-menus` line:

```go
	r.Get("/menu-items", h.MenuItems)
```

And add this method immediately after `TopMenus`:

```go
// MenuItems returns every item sold in the window (no LIMIT), for the
// manager dashboard's "All items" list. TopMenus stays capped at 10 for
// the item-mix donut.
func (h *Handler) MenuItems(w http.ResponseWriter, r *http.Request) {
	from, to, err := rangeFromQuery(r)
	if err != nil {
		response.Error(w, r, http.StatusBadRequest, err.Error(), err)
		return
	}
	items, err := h.svc.MenuItems(r.Context(), from, to)
	if err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to load menu items", err)
		return
	}
	response.OK(w, r, items)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /home/nate/Dev/mulan
go test ./internal/dashboard/... -v && go build ./...
```

Expected: all five tests in the package PASS; build exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan
git add internal/dashboard/http/handler.go internal/dashboard/http/range_test.go
git commit -m "feat(dashboard): expose GET /dashboard/menu-items"
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

### Task 7: Render the Custom segment and All items list

**Files:**
- Modify: `/home/nate/Dev/mulan-manager/src/routes/(app)/+page.svelte`

**Interfaces:**
- Consumes: `presetRange`, `customRange`, `type FixedPreset` from Task 5; `DashboardData.allItems` from Task 6.
- Produces: the finished UI. Nothing downstream depends on it.

Context: the page holds `preset = $state('7d')`, `data`, `loading`, `errored`, and an `$effect` that calls `load(preset)`. `SegmentedControl` takes `options: {label, value}[]` and `bind:value`. The "Top items" section spans lines 109-128; the Item mix donut at line 103 keeps reading `data.topMenus` and must not be touched.

Design notes for the implementer:
- Reading `customFrom` / `customTo` inside the `$effect` is what makes editing a date re-trigger the load — that's intended, not accidental.
- Keep stale `data` on screen when a custom range is invalid; only show the message. Blanking the dashboard while someone is mid-edit of a date field is worse than showing the previous period.
- `<input type="date">` is used deliberately: it opens the native iOS date wheel, which is the right control on a phone-first page and needs no new component.

- [ ] **Step 1: Update the imports and script state**

In `/home/nate/Dev/mulan-manager/src/routes/(app)/+page.svelte`, change the range import to:

```ts
	import { presetRange, customRange, type FixedPreset } from '$lib/dashboard/range';
```

Add `Custom` to the presets array:

```ts
	const presets = [
		{ label: 'Today', value: 'today' },
		{ label: '7D', value: '7d' },
		{ label: '30D', value: '30d' },
		{ label: '90D', value: '90d' },
		{ label: 'Custom', value: 'custom' }
	];
```

Replace the state declarations and `load`/`$effect` block (currently lines 25-44) with:

```ts
	const initial = presetRange('7d', new Date());

	let preset = $state('7d');
	let customFrom = $state(initial.from);
	let customTo = $state(initial.to);
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

	$effect(() => {
		if (preset === 'custom') {
			const range = customRange(customFrom, customTo);
			if (!range) {
				// Keep the last good data on screen; just explain why we didn't refetch.
				rangeError = !customFrom || !customTo
					? 'Pick both a start and an end date.'
					: customFrom > customTo
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
		load(presetRange(preset as FixedPreset, new Date()));
	});
```

`load` now takes a resolved `Range` instead of a preset string. Add `MAX_RANGE_DAYS` and `type Range` to the same range import:

```ts
	import {
		presetRange,
		customRange,
		MAX_RANGE_DAYS,
		type FixedPreset,
		type Range
	} from '$lib/dashboard/range';
```

- [ ] **Step 2: Render the date inputs**

Immediately after `<SegmentedControl options={presets} bind:value={preset} />`, insert:

```svelte
	{#if preset === 'custom'}
		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class="mb-1 block px-1 text-xs text-[var(--ios-label-secondary)]">From</span>
				<input
					type="date"
					bind:value={customFrom}
					class="h-11 w-full rounded-xl border border-[var(--ios-separator)] bg-[var(--ios-card)] px-3 text-[var(--ios-label)]"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block px-1 text-xs text-[var(--ios-label-secondary)]">To</span>
				<input
					type="date"
					bind:value={customTo}
					class="h-11 w-full rounded-xl border border-[var(--ios-separator)] bg-[var(--ios-card)] px-3 text-[var(--ios-label)]"
				/>
			</label>
		</div>
		{#if rangeError}
			<p class="px-1 text-sm text-[var(--ios-red)]">{rangeError}</p>
		{/if}
	{/if}
```

`h-11` is 44px — the minimum touch target.

- [ ] **Step 3: Switch the list to all items**

Replace the "Top items" block (currently lines 109-128) with:

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

Leave the "Item mix" `<Donut items={data.topMenus} />` block above it exactly as it is.

- [ ] **Step 4: Check, lint, and run the unit suite**

```bash
cd /home/nate/Dev/mulan-manager
npm run check && npm run lint && npx vitest run
```

Expected: `check` 0 errors; `lint` clean (run `npm run format` first if prettier complains about formatting); all vitest specs PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/nate/Dev/mulan-manager
git add "src/routes/(app)/+page.svelte"
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
- Tap **Custom**: two date inputs appear, prefilled with the last 7 days, and the dashboard loads that range.
- Set From to ~6 months back: KPI cards, waterfall, sales chart, heatmap, donut, and the items list all refresh to the wider range with no error banner.
- Set To earlier than From: "End date must be on or after the start date." appears, the previous data stays on screen, and the Network tab shows **no** new `/api/dashboard/*` requests.
- Set a range wider than 366 days: "Range can't exceed 366 days." appears, again with no request fired.
- Tap back to 7D: the date inputs disappear and the dashboard reloads the preset range.

- [ ] **Step 5: Report results**

Write up what actually happened for each check above, quoting the observed numbers and status codes. If anything failed, fix it and re-run the affected checks before marking this task done.

---

## Self-Review

**Spec coverage:**
- Backend `MenuItemsBySales` query → Task 2 ✓
- Backend `MenuItems` service method → Task 3 ✓
- Backend `/menu-items` route + handler → Task 4 ✓
- `maxRangeDays` 92 → 366 → Task 1 ✓
- `Preset` widened, `customRange`, `MAX_RANGE_DAYS` → Task 5 ✓
- `customRange` specs (valid / empty from / empty to / reversed / 366 / 367) → Task 5, plus a single-day case ✓
- `DashboardData.allItems` + fetch → Task 6 ✓
- Custom segment, date inputs, `rangeError`, "All items" heading and list, donut untouched → Task 7 ✓
- Verification steps 1-5 from the spec → Task 8 ✓
- No proxy `ALLOW` change, no `main.go` change → stated in Global Constraints ✓

**Type consistency:** `TopMenuItem` (Go) and `TopMenu` (TS) are reused, not redefined. `MenuItemsBySalesParams`/`Row` names in Task 3 match what sqlc generates from the `-- name: MenuItemsBySales` directive in Task 2. `FixedPreset`, `MAX_RANGE_DAYS`, `Range`, and `customRange` are defined in Task 5 and consumed under those exact names in Task 7. `load` changes signature from `(p: string)` to `(range: Range)` within a single task (7), so no cross-task mismatch.
