# Menu Generator Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable PDF background, generator-only item exclusion (PDF only), and backend-persisted drag-and-drop item ordering (default Menu Name A→Z) to the Menu Generator.

**Architecture:** Backend gains a `sort_order` column on `menus` plus a single-statement reorder endpoint (mirrors the base-options `sort_order` pattern). The frontend sorts each category by `(sort_order, name)`, renders one combined per-category Items table with `svelte-dnd-action` drag handles + exclude toggles, and feeds a filtered sheet to the PDF while the Excel keeps the full sheet.

**Tech Stack:** Go + chi + sqlc + pgx + Atlas (backend, `../mulan`); SvelteKit 2 / Svelte 5 runes + pdfmake + write-excel-file + `svelte-dnd-action` (frontend); vitest.

## Global Constraints

- Money is THB floats over the wire; display only, never compute. (Not touched here.)
- Backend owner-only writes live under the `RequireRole(owner)` group in `main.go`.
- Frontend proxy `ALLOW` (`src/routes/api/[...path]/+server.ts`) already permits any path under `menus/` — no change needed for `menus/reorder`.
- Deploy order: migrate + deploy backend (`../mulan`) FIRST, then push frontend.
- Backend migrations: edit `schema.hcl`, apply with `task migrate-dev` then `task migrate-prod`, regenerate `schema.sql` with `task generate-sql-schema`, regenerate Go with `task sqlcgen`.
- Excluded items and the background choice are in-memory generator state only — never persisted, never sent to the backend.

---

## Backend (`../mulan`)

> All backend paths below are relative to `/home/nate/Dev/mulan`.

### Task 1: Add `sort_order` to the `menus` table

**Files:**
- Modify: `schema.hcl` (the `table "menus"` block, lines 559-602)
- Regenerate: `schema.sql`

- [ ] **Step 1: Add the column and index to `schema.hcl`**

In `schema.hcl`, inside `table "menus" {`, add a `sort_order` column immediately after the `favourite` column (after line 591) and an index after the `foreign_key` block (after line 601):

```hcl
  column "favourite" {
    type    = boolean
    null    = false
    default = false
  }
  column "sort_order" {
    type    = int
    null    = false
    default = 0
  }
```

```hcl
  foreign_key "fk_menu_category" {
    columns     = [column.category_id]
    ref_columns = [table.menu_categories.column.id]
    on_delete   = SET_NULL
  }
  index "menus_category_sort" {
    columns = [column.category_id, column.sort_order]
  }
}
```

- [ ] **Step 2: Apply the migration to the dev database**

Run: `task migrate-dev`
Expected: Atlas prints a plan adding column `sort_order` + index `menus_category_sort`, then applies it.

- [ ] **Step 3: Regenerate `schema.sql`**

Run: `task generate-sql-schema`
Expected: `schema.sql` now shows `"sort_order" integer NOT NULL DEFAULT 0` in the `menus` table and a `menus_category_sort` index. Verify with:
`grep -n "sort_order" schema.sql | grep -i menu`

- [ ] **Step 4: Commit**

```bash
git add schema.hcl schema.sql
git commit -m "feat(menu): add sort_order column to menus"
```

---

### Task 2: sqlc queries — order the list, add the reorder statement

**Files:**
- Modify: `internal/sql/menus.query.sql`
- Modify: `internal/sql/menus.command.sql`
- Regenerate: `sqlc/*.go` via `task sqlcgen`

**Interfaces:**
- Produces: `db.Menu.SortOrder int32`; `Queries.SetMenuOrder(ctx, SetMenuOrderParams{ Ids []int32; CategoryID pgtype.Int4 }) error`.

- [ ] **Step 1: Update `menus.query.sql`**

Replace the file's `ListMenus`, `GetMenu`, and any RETURNING lists so every menu read includes `sort_order`, and order the list. Full file:

```sql
-- name: ListMenus :many
SELECT id, name, price, category_id, vfd_name, active, favourite, sort_order
FROM menus
ORDER BY category_id, sort_order, name;

-- name: GetMenu :one
SELECT id, name, price, category_id, vfd_name, active, favourite, sort_order
FROM menus WHERE id = $1;
```

(If the file has additional queries beyond these two, add `, sort_order` to their SELECT column lists too; do not change their WHERE/ORDER clauses.)

- [ ] **Step 2: Update `menus.command.sql`**

Add `sort_order` to each `RETURNING` list and append the reorder statement. Full file:

```sql
-- name: CreateMenu :one
INSERT INTO menus (name, price, category_id, vfd_name, favourite)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, name, price, category_id, vfd_name, active, favourite, sort_order;

-- name: UpdateMenu :one
UPDATE menus SET name = $2, price = $3, category_id = $4, vfd_name = $5, favourite = $6
WHERE id = $1
RETURNING id, name, price, category_id, vfd_name, active, favourite, sort_order;

-- name: ToggleMenu :one
UPDATE menus SET active = NOT active WHERE id = $1
RETURNING id, name, price, category_id, vfd_name, active, favourite, sort_order;

-- name: DeleteMenu :exec
DELETE FROM menus WHERE id = $1;

-- name: SetMenuOrder :exec
-- Assigns sort_order = 1-based position for each id in @ids, but only for menus
-- that belong to @category_id (IS NOT DISTINCT FROM handles a NULL category).
-- Ids from another category are silently skipped, so a bad request can never
-- reorder a different category.
UPDATE menus
SET sort_order = data.ord
FROM (
    SELECT unnest(@ids::int[]) AS id,
           generate_subscripts(@ids::int[], 1) AS ord
) AS data
WHERE menus.id = data.id
  AND menus.category_id IS NOT DISTINCT FROM @category_id;
```

- [ ] **Step 3: Regenerate sqlc**

Run: `task sqlcgen`
Expected: no errors. Verify with:
`grep -n "SortOrder" sqlc/models.go` (should show `SortOrder int32` in `type Menu struct`) and
`grep -n "SetMenuOrder" sqlc/*.go` (should show the generated method + `SetMenuOrderParams`).

- [ ] **Step 4: Confirm the build compiles**

Run: `go build ./...`
Expected: success (no callers broken — `db.Menu` only gained a field).

- [ ] **Step 5: Commit**

```bash
git add internal/sql/menus.query.sql internal/sql/menus.command.sql sqlc/
git commit -m "feat(menu): sqlc reorder query + sort_order in reads"
```

---

### Task 3: Service reorder method + DTO field + handler + route

**Files:**
- Modify: `internal/menu/service/menu.go`
- Modify: `internal/menu/http/handler.go`
- Modify: `internal/menu/http/handler_test.go`
- Modify: `main.go` (owner-only route group, near line 208-213)

**Interfaces:**
- Consumes: `Queries.SetMenuOrder` (Task 2).
- Produces: `MenuService.Reorder(ctx, categoryID *int32, orderedIDs []int32) error`; `menuResponse.SortOrder int32 \`json:"sort_order"\``; route `PATCH /menus/reorder`.

- [ ] **Step 1: Add the DTO field + mapping (failing test first)**

In `internal/menu/http/handler_test.go`, extend the first `TestToMenuResponse` case (`"all fields set"`) to assert `SortOrder`. Add `SortOrder: 4` to its `in: sqlc.Menu{...}` and `SortOrder: 4` to its `want: menuResponse{...}`, then add this check inside the `t.Run` body after the price check:

```go
		if got.SortOrder != tc.want.SortOrder {
			t.Fatalf("sort_order: got %v want %v", got.SortOrder, tc.want.SortOrder)
		}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/menu/http/ -run TestToMenuResponse`
Expected: FAIL — `menuResponse` has no field `SortOrder`.

- [ ] **Step 3: Add `SortOrder` to `menuResponse` and set it in `toMenuResponse`**

In `internal/menu/http/handler.go`, add to the `menuResponse` struct (after `Favourite`):

```go
	Favourite    bool                      `json:"favourite"`
	SortOrder    int32                     `json:"sort_order"`
```

And in `toMenuResponse`, set it (after `Favourite: m.Favourite,`):

```go
		Favourite:    m.Favourite,
		SortOrder:    m.SortOrder,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `go test ./internal/menu/http/ -run TestToMenuResponse`
Expected: PASS.

- [ ] **Step 5: Add the service method**

In `internal/menu/service/menu.go`, add (keep the `pgtype` import — it is already present):

```go
// Reorder assigns each menu in orderedIDs a 1-based sort_order within its
// category. Ids that don't belong to categoryID are ignored by the query.
func (s *MenuService) Reorder(ctx context.Context, categoryID *int32, orderedIDs []int32) error {
	catID := pgtype.Int4{}
	if categoryID != nil {
		catID = pgtype.Int4{Int32: *categoryID, Valid: true}
	}
	return s.q.SetMenuOrder(ctx, db.SetMenuOrderParams{
		Ids:        orderedIDs,
		CategoryID: catID,
	})
}
```

- [ ] **Step 6: Add the handler**

In `internal/menu/http/handler.go`, add (near the other handlers):

```go
type reorderRequest struct {
	CategoryID *int32  `json:"category_id"`
	OrderedIDs []int32 `json:"ordered_ids"`
}

// Reorder sets the display order of menus within one category. PATCH /api/menus/reorder
func (h *MenuHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req reorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, r, http.StatusBadRequest, "invalid body", err)
		return
	}
	if err := h.svc.Reorder(r.Context(), req.CategoryID, req.OrderedIDs); err != nil {
		response.Error(w, r, http.StatusInternalServerError, "failed to reorder menus", err)
		return
	}
	response.NoContent(w, r)
}
```

- [ ] **Step 7: Register the route**

In `main.go`, inside the `RequireRole(owner)` group, add the reorder route next to the other `menus` writes (after `r.Patch("/menus/{id}/toggle", ...)`):

```go
				r.Patch("/menus/reorder", menuHandler.Reorder)
```

(chi's trie routing gives the static `/menus/reorder` precedence over `/menus/{id}`, so ordering of registration does not matter.)

- [ ] **Step 8: Build + test**

Run: `go build ./... && go test ./internal/menu/...`
Expected: build succeeds; tests PASS.

- [ ] **Step 9: Commit**

```bash
git add internal/menu/ main.go
git commit -m "feat(menu): reorder endpoint (owner-only) + sort_order DTO"
```

---

### Task 4: Deploy the backend

**Files:** none (ops).

- [ ] **Step 1: Apply the migration to production**

Run: `task migrate-prod`
Expected: Atlas applies the `sort_order` column + index to prod. (Additive, non-breaking — existing rows default to 0.)

- [ ] **Step 2: Deploy the `mulan` backend** per its normal deploy process, then confirm the running backend serves the new field:

Run: `curl -s http://100.109.90.83:8085/api/menus | head -c 400`
Expected: each menu object now includes `"sort_order":0`.

- [ ] **Step 3: Smoke-test the reorder endpoint against the live backend**

Pick two menu ids in the same category from the list above, then (owner bearer required — reorder is owner-only; run from an authenticated context or the frontend). Minimal check that the route exists and isn't shadowed by `/menus/{id}`:

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://100.109.90.83:8085/api/menus/reorder -H 'Content-Type: application/json' -d '{"category_id":null,"ordered_ids":[]}'`
Expected: `401` (auth required) — NOT `400`/`404` from the `{id}` handler parsing `reorder` as an id. A `401` proves the static route matched.

---

## Frontend (`mulan-manager`)

> All frontend paths below are relative to `/home/nate/Dev/mulan-manager`.

### Task 5: `Menu.sort_order` + `reorderMenus` API client

**Files:**
- Modify: `src/lib/api/menus.ts`

**Interfaces:**
- Produces: `Menu.sort_order: number`; `reorderMenus(categoryId: number | null, orderedIds: number[]): Promise<void>`.

- [ ] **Step 1: Add `sort_order` to the `Menu` interface**

In `src/lib/api/menus.ts`, add to `interface Menu` (after `favourite: boolean;`):

```ts
	favourite: boolean;
	sort_order: number;
```

- [ ] **Step 2: Add the reorder client**

After `deleteMenu`, add:

```ts
export const reorderMenus = (categoryId: number | null, orderedIds: number[]) =>
	fetch('/api/menus/reorder', {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ category_id: categoryId, ordered_ids: orderedIds })
	}).then(ok);
```

- [ ] **Step 3: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors (any `Menu` test fixtures without `sort_order` are covered in Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/menus.ts
git commit -m "feat(menu-generator): sort_order on Menu + reorderMenus client"
```

---

### Task 6: `model.ts` — row ids, `(sort_order, name)` sort, `filterExcluded`

**Files:**
- Modify: `src/lib/menu-pdf/model.ts`
- Modify: `src/lib/menu-pdf/model.spec.ts`

**Interfaces:**
- Consumes: `Menu.sort_order` (Task 5).
- Produces: `SheetRow.id: number`; `filterExcluded(sheet: MenuSheet, excluded: Set<number>): MenuSheet`; `buildMenuSheet` orders each category by `(sort_order, name)`.

- [ ] **Step 1: Write failing tests**

In `src/lib/menu-pdf/model.spec.ts`, add `sort_order: 0` to the `menu()` factory defaults (after `favourite: false,`). Then append:

```ts
import { buildMenuSheet, filterExcluded } from './model';

describe('buildMenuSheet ordering', () => {
	it('orders items within a category by (sort_order, name)', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Zebra', category_id: 20, sort_order: 0 }),
				menu({ id: 2, name: 'Apple', category_id: 20, sort_order: 0 }),
				menu({ id: 3, name: 'First', category_id: 20, sort_order: 1 })
			],
			cats
		);
		const food = sheet.sections.find((s) => s.title === 'Food')!;
		// sort_order 0 ties break by name (Apple, Zebra); sort_order 1 (First) last.
		expect(food.rows.map((r) => r.name)).toEqual(['Apple', 'Zebra', 'First']);
	});

	it('tags each row with its menu id', () => {
		const sheet = buildMenuSheet([menu({ id: 42, name: 'X', category_id: 20 })], cats);
		expect(sheet.sections.find((s) => s.title === 'Food')!.rows[0].id).toBe(42);
	});
});

describe('filterExcluded', () => {
	it('drops excluded rows and prunes emptied sections', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Keep', category_id: 20 }),
				menu({ id: 2, name: 'Drop', category_id: 20 }),
				menu({ id: 3, name: 'Lonely', category_id: 10 })
			],
			cats
		);
		const out = filterExcluded(sheet, new Set([2, 3]));
		expect(out.sections.map((s) => s.title)).toEqual(['Food']);
		expect(out.sections[0].rows.map((r) => r.name)).toEqual(['Keep']);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/menu-pdf/model.spec.ts`
Expected: FAIL — `filterExcluded` not exported; `SheetRow.id` missing; ordering not alphabetical.

- [ ] **Step 3: Add `id` to `SheetRow`**

In `src/lib/menu-pdf/model.ts`, add to `interface SheetRow`:

```ts
export interface SheetRow {
	id: number;
	name: string;
	prices: (number | null)[];
	single: number | null;
}
```

- [ ] **Step 4: Sort each category and populate `id`**

In `buildSection`, sort the items and include `id` in both row builders. Replace the body:

```ts
function buildSection(title: string, items: Menu[], globalColumns: string[]): SheetSection {
	const ordered = [...items].sort(
		(a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
	);
	const hasVariants = ordered.some((m) => m.base_options.length > 0);
	if (!hasVariants) {
		return {
			title,
			columns: [],
			rows: ordered.map((m) => ({ id: m.id, name: m.name, prices: [], single: m.price }))
		};
	}

	const columns = globalColumns;
	const rows: SheetRow[] = ordered.map((m) => {
		const priceByName = new Map(m.base_options.map((b) => [b.name, b.price]));
		const prices = columns.map((c) => (priceByName.has(c) ? priceByName.get(c)! : null));
		const single = m.base_options.length === 0 ? m.price : null;
		return { id: m.id, name: m.name, prices, single };
	});

	return { title, columns, rows };
}
```

- [ ] **Step 5: Add `filterExcluded`**

Append to `src/lib/menu-pdf/model.ts`:

```ts
// Generator-only: drop excluded menu ids from a sheet and prune any section that
// ends up empty. Used for the PDF only; the Excel export keeps the full sheet.
export function filterExcluded(sheet: MenuSheet, excluded: Set<number>): MenuSheet {
	if (excluded.size === 0) return sheet;
	return {
		sections: sheet.sections
			.map((s) => ({ ...s, rows: s.rows.filter((r) => !excluded.has(r.id)) }))
			.filter((s) => s.rows.length > 0)
	};
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/menu-pdf/model.spec.ts`
Expected: PASS. Also run the full suite to catch fixture gaps: `npx vitest run` — fix any other `menu()`/`Menu` fixtures now missing `sort_order` (add `sort_order: 0`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/menu-pdf/model.ts src/lib/menu-pdf/model.spec.ts
git commit -m "feat(menu-generator): sort rows by (sort_order, name); row ids; filterExcluded"
```

---

### Task 6b: Re-key price overrides by menu id

**Files:**
- Modify: `src/lib/menu-pdf/overrides.ts`
- Modify: `src/lib/menu-pdf/overrides.spec.ts`

**Why:** the variant-price overrides are keyed by `(sectionIndex, rowIndex)`. Once items can be reordered, a position key would follow the *slot*, not the item, silently mis-assigning a price adjustment after a drag. Re-key by the stable menu id (now on `SheetRow`). Also removes `rowKey`.

**Interfaces:**
- Consumes: `SheetRow.id` (Task 6).
- Produces: `Overrides = Record<number, (number | null)[]>` (keyed by menu id); `PartialRow.key: number` (menu id); `applyOverrides` matches rows by `r.id`. `rowKey` is removed.

- [ ] **Step 1: Rewrite the tests (failing first)**

Replace `src/lib/menu-pdf/overrides.spec.ts` with (fixtures now carry `id`, keys are ids, `rowKey` gone):

```ts
import { describe, it, expect } from 'vitest';
import { partialRows, movePrice, applyOverrides, type Overrides } from './overrides';
import type { MenuSheet } from './model';

const sheet: MenuSheet = {
	sections: [
		{
			title: 'Coffee',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [
				{ id: 1, name: 'Espresso', prices: [75, 90, 105], single: null },
				{ id: 2, name: 'Latte', prices: [80, 95, null], single: null },
				{ id: 3, name: 'Flat Coffee', prices: [null, null, null], single: 110 }
			]
		},
		{
			title: 'Italian Soda',
			columns: ['Hot', 'Iced', 'Frappé'],
			rows: [{ id: 4, name: 'Blue Raspberry', prices: [null, 75, null], single: null }]
		},
		{
			title: 'Food',
			columns: [],
			rows: [{ id: 5, name: 'Pancake', prices: [], single: 80 }]
		}
	]
};

describe('partialRows', () => {
	it('includes partial variant rows and flat-priced items in a variant section', () => {
		expect(partialRows(sheet).map((r) => r.name)).toEqual(['Latte', 'Flat Coffee', 'Blue Raspberry']);
	});
	it('keys rows by menu id', () => {
		expect(partialRows(sheet).map((r) => r.key)).toEqual([2, 3, 4]);
	});
	it('carries the flat single price for an unassigned item', () => {
		const dirty = partialRows(sheet).find((r) => r.name === 'Flat Coffee')!;
		expect(dirty.prices).toEqual([null, null, null]);
		expect(dirty.single).toBe(110);
	});
});

describe('movePrice', () => {
	it('moves a price into an adjacent empty column', () => {
		expect(movePrice([null, 75, null], 1, 2)).toEqual([null, null, 75]);
		expect(movePrice([null, 75, null], 1, 0)).toEqual([75, null, null]);
	});
	it('is a no-op when the target is already filled', () => {
		expect(movePrice([80, 95, null], 1, 0)).toEqual([80, 95, null]);
	});
	it('is a no-op when the source is empty', () => {
		expect(movePrice([null, 75, null], 0, 2)).toEqual([null, 75, null]);
	});
	it('is safe for out-of-range indices and returns a fresh array', () => {
		const input = [null, 75, null];
		const result = movePrice(input, 1, 9);
		expect(result).toEqual([null, 75, null]);
		expect(result).not.toBe(input);
	});
});

describe('applyOverrides', () => {
	it('replaces prices for the row with that menu id, leaving the rest untouched', () => {
		const overrides: Overrides = { 4: [75, null, null] };
		const result = applyOverrides(sheet, overrides);
		expect(result.sections[1].rows[0].prices).toEqual([75, null, null]);
		expect(result.sections[0].rows[0].prices).toEqual([75, 90, 105]);
		expect(result.sections[2].rows[0].single).toBe(80);
	});
	it('returns the sheet structure unchanged when there are no overrides', () => {
		const result = applyOverrides(sheet, {});
		expect(result.sections.map((s) => s.title)).toEqual(['Coffee', 'Italian Soda', 'Food']);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/menu-pdf/overrides.spec.ts`
Expected: FAIL — `rowKey` import removed but source still exports position keys; `PartialRow.key` still a string.

- [ ] **Step 3: Re-key `overrides.ts`**

Edit `src/lib/menu-pdf/overrides.ts`: change the type + `PartialRow.key`, delete `rowKey`, and match by `r.id`:

```ts
export type Overrides = Record<number, (number | null)[]>; // keyed by menu id
```

```ts
export interface PartialRow {
	key: number; // menu id
	sectionTitle: string;
	name: string;
	columns: string[];
	prices: (number | null)[];
	single: number | null;
}
```

Delete the `rowKey` function entirely. Rewrite `partialRows` to key by `r.id`:

```ts
export function partialRows(sheet: MenuSheet): PartialRow[] {
	const out: PartialRow[] = [];
	for (const s of sheet.sections) {
		if (s.columns.length === 0) continue;
		for (const r of s.rows) {
			const n = nonNullCount(r.prices);
			if (n < s.columns.length && (n >= 1 || r.single != null)) {
				out.push({
					key: r.id,
					sectionTitle: s.title,
					name: r.name,
					columns: s.columns,
					prices: r.prices,
					single: r.single
				});
			}
		}
	}
	return out;
}
```

Rewrite `applyOverrides` to match by id (keep `movePrice` unchanged):

```ts
export function applyOverrides(sheet: MenuSheet, overrides: Overrides): MenuSheet {
	return {
		sections: sheet.sections.map((s) => ({
			...s,
			rows: s.rows.map((r) => {
				const ov = overrides[r.id];
				return ov ? { ...r, prices: ov } : r;
			})
		}))
	};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/menu-pdf/overrides.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu-pdf/overrides.ts src/lib/menu-pdf/overrides.spec.ts
git commit -m "refactor(menu-generator): key price overrides by menu id"
```

---

### Task 7: `pdf.ts` — luminance-based ink + background color

**Files:**
- Modify: `src/lib/menu-pdf/model.ts` (add `background` to `Branding`)
- Modify: `src/lib/menu-pdf/pdf.ts`
- Modify: `src/lib/menu-pdf/pdf.spec.ts`

**Interfaces:**
- Produces: `Branding.background: string`; `inkFor(bg: string): string`.

- [ ] **Step 1: Write failing tests**

In `src/lib/menu-pdf/pdf.spec.ts`, add (adjust the import line to include `inkFor`):

```ts
import { buildDocDefinition, inkFor } from './pdf';

describe('inkFor', () => {
	it('returns dark ink on a light background', () => {
		expect(inkFor('#f3ead8')).toBe('#2b2b2b'); // cream
		expect(inkFor('#ffffff')).toBe('#2b2b2b');
	});
	it('returns light ink on a dark background', () => {
		expect(inkFor('#2b2b2b')).toBe('#f7f2e8');
		expect(inkFor('#000000')).toBe('#f7f2e8');
	});
});
```

(If `pdf.spec.ts` already imports from `./pdf`, extend that import instead of adding a second one.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/menu-pdf/pdf.spec.ts`
Expected: FAIL — `inkFor` is not exported.

- [ ] **Step 3: Add `background` to `Branding`**

In `src/lib/menu-pdf/model.ts`, add to `interface Branding`:

```ts
export interface Branding {
	title: string;
	tagline: string;
	subtitle: string;
	hours: string;
	footer: string;
	background: string;
}
```

- [ ] **Step 4: Implement `inkFor` and use the branding colors**

In `src/lib/menu-pdf/pdf.ts`, add `inkFor` near the top (after the `INK` constant) and a light-ink constant:

```ts
const LIGHT_INK = '#f7f2e8';

// Pick a legible text color for a background: dark ink on light backgrounds,
// light ink on dark ones, by perceived luminance.
export function inkFor(bg: string): string {
	const hex = bg.replace('#', '');
	const r = parseInt(hex.slice(0, 2), 16);
	const g = parseInt(hex.slice(2, 4), 16);
	const b = parseInt(hex.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance >= 0.6 ? INK : LIGHT_INK;
}
```

Then in `buildDocDefinition`, compute the ink once and thread the colors through. Change the top of the returned object and the two color sites:

```ts
export function buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions {
	const ink = inkFor(b.background);
	return {
		pageSize: 'A5',
		pageOrientation: 'portrait',
		pageMargins: [34, 32, 34, 38],
		defaultStyle: { font: 'Sarabun', fontSize: 11, color: ink },
		background: () => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: A5_W, h: A5_H, color: b.background }]
		}),
```

and the footer's `color: INK` becomes `color: ink`:

```ts
		footer: () => ({
			text: `${b.hours}      ${b.footer}`,
			alignment: 'center',
			fontSize: 9,
			italics: true,
			color: ink,
			margin: [0, 12, 0, 0]
		})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/menu-pdf/pdf.spec.ts`
Expected: PASS. If existing `pdf.spec.ts` cases build a `Branding` literal, add `background: '#f3ead8'` to them.

- [ ] **Step 6: Commit**

```bash
git add src/lib/menu-pdf/model.ts src/lib/menu-pdf/pdf.ts src/lib/menu-pdf/pdf.spec.ts
git commit -m "feat(menu-generator): luminance-based text + selectable PDF background"
```

---

### Task 8: Wire background picker, exclude filtering, and Excel/PDF split into the page

**Files:**
- Modify: `src/routes/(app)/menu-generator/+page.svelte`

**Interfaces:**
- Consumes: `Branding.background` (Task 7), `filterExcluded` (Task 6), `inkFor` not needed here.
- Produces: reactive `excluded` set + `pdfSheet` used by the PDF; `brand.background` bound to a color input.

> This task adds the state and the background control. The per-row exclude toggles and drag handles are added with the combined table in Task 9.

- [ ] **Step 1: Import `filterExcluded` and default the background**

In the `<script>`, add `filterExcluded` to the model import and `background` to the initial `brand`:

```ts
	import { buildMenuSheet, filterExcluded, type Branding } from '$lib/menu-pdf/model';
```

```ts
	let brand = $state<Branding>({
		title: '',
		tagline: 'Since 2016',
		subtitle: '',
		hours: 'Open daily · 8am – 6pm',
		footer: 'All prices in Thai Baht (฿)',
		background: '#f3ead8'
	});
```

- [ ] **Step 2: Add the excluded set and the PDF-only filtered sheet**

After the `effectiveSheet` derivation, add:

```ts
	// Generator-only: menu ids hidden from the PDF (never sent to the backend,
	// not persisted). The Excel export deliberately ignores this.
	let excluded = $state<Set<number>>(new Set());
	function toggleExcluded(id: number) {
		const next = new Set(excluded);
		next.has(id) ? next.delete(id) : next.add(id);
		excluded = next;
	}
	const pdfSheet = $derived(filterExcluded(effectiveSheet, excluded));
```

- [ ] **Step 3: Feed the PDF from `pdfSheet`, keep Excel on `effectiveSheet`**

In the preview `$effect`, change the doc source from `effectiveSheet` to `pdfSheet`:

```ts
		const doc = buildDocDefinition(pdfSheet, { ...brand });
```

Leave `downloadXlsx` building from `effectiveSheet` (unchanged) — this is the PDF-only decision.

- [ ] **Step 4: Add the Background color row to the Branding card**

In the Branding `<Card>`, after the Footer note `TextField`, add:

```svelte
					<label class="flex items-center justify-between">
						<span class="text-[var(--ios-label)]">Background</span>
						<input
							type="color"
							bind:value={brand.background}
							class="h-9 w-14 rounded-lg border border-[var(--ios-separator)] bg-transparent"
							aria-label="PDF background color"
						/>
					</label>
```

- [ ] **Step 5: Verify build + preview updates**

Run: `npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors. (Manual check happens after Task 9 when the table exists.)

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/menu-generator/+page.svelte"
git commit -m "feat(menu-generator): background picker + PDF-only exclude plumbing"
```

---

### Task 9: Combined per-category Items table (drag reorder + exclude toggle)

**Files:**
- Modify: `package.json` (add `svelte-dnd-action`)
- Modify: `src/routes/(app)/menu-generator/+page.svelte`

**Interfaces:**
- Consumes: `menus` state, `categories` state, `effectiveSheet` (price lookup), `excluded`/`toggleExcluded` (Task 8), `reorderMenus` (Task 5), `listMenus` (already imported).

This task replaces the existing **"Adjust variant columns"** section (partials-only) with an **Items** section that lists every item per category with a drag handle, an exclude toggle, and the price cells (retaining the partial-price `‹ ›` / place controls).

- [ ] **Step 1: Install `svelte-dnd-action`**

Run: `npm install svelte-dnd-action`
Expected: added to `package.json` dependencies.

- [ ] **Step 2: Add imports and the drag-group model**

In the `<script>`, add:

```ts
	import { dndzone } from 'svelte-dnd-action';
	import { reorderMenus } from '$lib/api/menus';
```

Add a derived price-lookup map and a `$state` drag model rebuilt from `menus`:

```ts
	// Price/column cells for a row, looked up by menu id off the effective sheet.
	const rowById = $derived(
		new Map(
			effectiveSheet.sections.flatMap((s) =>
				s.rows.map((r) => [r.id, { columns: s.columns, row: r }] as const)
			)
		)
	);

	// Partial rows (need the ‹ ›/place price controls), looked up by menu id.
	// `partials` already exists in the page: const partials = $derived(partialRows(sheet));
	const partialById = $derived(new Map(partials.map((p) => [p.key, p])));

	// One drag group per category (categories in order, then uncategorised),
	// each holding its menus sorted by (sort_order, name). Rebuilt whenever the
	// menu list changes; mutated in place during a drag.
	type Group = { key: number | null; title: string; items: Menu[] };
	let groups = $state<Group[]>([]);
	$effect(() => {
		const order = (a: Menu, b: Menu) =>
			a.sort_order - b.sort_order || a.name.localeCompare(b.name);
		const active = menus.filter((m) => m.active);
		const next: Group[] = [];
		for (const c of categories) {
			const items = active.filter((m) => m.category_id === c.id).sort(order);
			if (items.length) next.push({ key: c.id, title: c.name, items });
		}
		const other = active.filter((m) => m.category_id == null).sort(order);
		if (other.length) next.push({ key: null, title: 'Other', items: other });
		groups = next;
	});

	function handleSort(gi: number, e: CustomEvent<{ items: Menu[] }>) {
		groups[gi].items = e.detail.items;
	}

	async function commitOrder(gi: number) {
		const g = groups[gi];
		const ids = g.items.map((m) => m.id);
		// Optimistic: reflect the new order locally so the preview updates now.
		menus = menus.map((m) => {
			const idx = ids.indexOf(m.id);
			return idx >= 0 ? { ...m, sort_order: idx + 1 } : m;
		});
		try {
			await reorderMenus(g.key, ids);
			menus = await listMenus();
		} catch (err) {
			showToast((err as Error).message, 'error');
			menus = await listMenus(); // reconcile on failure
		}
	}
```

Also change the existing override helper signatures in the page from string keys to number (menu id) keys — the bodies are unchanged:

```ts
	function move(key: number, base: (number | null)[], from: number, to: number) {
		overrides = { ...overrides, [key]: movePrice(overrides[key] ?? base, from, to) };
	}

	function place(p: PartialRow, col: number, value: number) {
		const arr: (number | null)[] = p.columns.map(() => null);
		arr[col] = value;
		overrides = { ...overrides, [p.key]: arr };
	}

	function clearRow(key: number) {
		const next = { ...overrides };
		delete next[key];
		overrides = next;
	}
```

- [ ] **Step 3: Replace the "Adjust variant columns" markup**

Replace the entire `{#if partials.length > 0} … {/if}` block with the Items table below. Keep `columnLabel`, `formatBaht`, and `partials` in place — the price controls still use them. Each row combines a drag handle, name, the price cells (with the `‹ ›`/place controls for partial rows), and the exclude toggle.

```svelte
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Items</p>
			<Card padded={false}>
				<p class="px-3 pt-3 text-xs text-[var(--ios-label-tertiary)]">
					Drag ≡ to reorder within a category. Tap the eye to hide an item from the PDF (the Excel
					export always includes everything). Use ‹ › to move a variant price between empty columns,
					or tap a faint price to place a flat item into a column.
				</p>
				{#each groups as g, gi (g.key ?? 'other')}
					<p
						class="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-[var(--ios-label-tertiary)]"
					>
						{g.title.toUpperCase()}
					</p>
					<ul
						class="divide-y divide-[var(--ios-separator)]"
						use:dndzone={{ items: g.items, flipDurationMs: 150, dropTargetStyle: {} }}
						onconsider={(e) => handleSort(gi, e)}
						onfinalize={(e) => {
							handleSort(gi, e);
							commitOrder(gi);
						}}
					>
						{#each g.items as m (m.id)}
							{@const hidden = excluded.has(m.id)}
							{@const partial = partialById.get(m.id)}
							{@const info = rowById.get(m.id)}
							{@const cur = partial ? (overrides[m.id] ?? partial.prices) : null}
							<li class="flex items-center gap-2 px-3 py-2" class:opacity-40={hidden}>
								<span
									class="cursor-grab px-1 text-lg text-[var(--ios-label-tertiary)] select-none"
									aria-hidden="true">≡</span
								>
								<span class="flex-1 text-[var(--ios-label)]" class:line-through={hidden}>{m.name}</span>
								<div class="flex items-center gap-1 text-sm tabular-nums">
									{#if partial && cur}
										{#each partial.columns as col, ci (col)}
											{@const v = cur[ci]}
											<span class="flex w-14 items-center justify-end gap-0.5">
												{#if v != null}
													{#if ci > 0 && cur[ci - 1] == null}
														<button
															type="button"
															class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
															aria-label={`Move ${m.name} ${col} price left`}
															onclick={() => move(m.id, partial.prices, ci, ci - 1)}>‹</button
														>
													{/if}
													<span class="text-[var(--ios-label)]">{formatBaht(v)}</span>
													{#if ci < partial.columns.length - 1 && cur[ci + 1] == null}
														<button
															type="button"
															class="flex h-6 w-6 items-center justify-center rounded-full text-[var(--ios-blue)] active:bg-[var(--ios-fill)]"
															aria-label={`Move ${m.name} ${col} price right`}
															onclick={() => move(m.id, partial.prices, ci, ci + 1)}>›</button
														>
													{/if}
												{:else if partial.single != null && cur.every((x) => x == null)}
													<button
														type="button"
														class="rounded px-1 text-xs text-[var(--ios-label-tertiary)] underline decoration-dotted active:bg-[var(--ios-fill)]"
														aria-label={`Place ${m.name} price in ${col}`}
														onclick={() => place(partial, ci, partial.single ?? 0)}
														>{formatBaht(partial.single)}</button
													>
												{:else}
													<span class="text-[var(--ios-label-tertiary)]">·</span>
												{/if}
											</span>
										{/each}
										{#if m.id in overrides}
											<button
												type="button"
												class="text-xs text-[var(--ios-blue)]"
												onclick={() => clearRow(m.id)}>Reset</button
											>
										{/if}
									{:else if info}
										{#if info.columns.length === 0}
											<span class="w-14 text-right text-[var(--ios-label-secondary)]"
												>{info.row.single == null ? '' : formatBaht(info.row.single)}</span
											>
										{:else}
											{#each info.columns as _c, ci (ci)}
												<span class="w-14 text-right text-[var(--ios-label-secondary)]"
													>{info.row.prices[ci] == null ? '·' : formatBaht(info.row.prices[ci]!)}</span
												>
											{/each}
										{/if}
									{/if}
								</div>
								<button
									type="button"
									class="flex h-8 w-8 items-center justify-center rounded-full active:bg-[var(--ios-fill)]"
									aria-label={hidden ? `Show ${m.name} in PDF` : `Hide ${m.name} from PDF`}
									aria-pressed={hidden}
									onclick={() => toggleExcluded(m.id)}>{hidden ? '🚫' : '👁'}</button
								>
							</li>
						{/each}
					</ul>
				{/each}
			</Card>
		</div>
```

- [ ] **Step 4: Run the Svelte autofixer on the changed component**

Use the `svelte` MCP `svelte-autofixer` tool on the full contents of `src/routes/(app)/menu-generator/+page.svelte`. Apply its fixes and re-run until it reports no issues (Svelte 5 runes: `onconsider`/`onfinalize` are the current event names; `dndzone` is a Svelte action).

- [ ] **Step 5: Typecheck + unit tests**

Run: `npx svelte-check --tsconfig ./tsconfig.json && npx vitest run`
Expected: 0 type errors; all tests pass.

- [ ] **Step 6: Manual verification (drive the real app)**

Run the app (`npm run dev`, or the project `run` skill) against the live backend, open `/menu-generator`, and confirm:
1. Items list per category, alphabetical by default.
2. Dragging ≡ reorders within a category; the PDF preview reflects the new order; reloading the page keeps the order (persisted).
3. Toggling the eye dims/strikes a row and removes it from the PDF preview; the item still appears in the downloaded Excel.
4. Changing the Background color updates the PDF preview and text stays legible on a dark color.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json "src/routes/(app)/menu-generator/+page.svelte"
git commit -m "feat(menu-generator): combined Items table with drag reorder + exclude"
```

---

### Task 10: Format, final checks, and deploy the frontend

**Files:** none beyond formatting.

- [ ] **Step 1: Format**

Run: `npx prettier --write src/lib/menu-pdf/ "src/routes/(app)/menu-generator/+page.svelte" src/lib/api/menus.ts`

- [ ] **Step 2: Full verification**

Run: `npx svelte-check --tsconfig ./tsconfig.json && npx vitest run && npm run build`
Expected: 0 errors; all tests pass; build succeeds.

- [ ] **Step 3: Commit any formatting + push**

```bash
git add -A
git commit -m "chore(menu-generator): format"
git push
```

Expected: render auto-deploys `main`. (Backend was already deployed in Task 4.)

---

## Self-Review notes

- **Spec coverage:** F1 background → Tasks 7, 8. F2 exclude (PDF only) → Tasks 6 (`filterExcluded`, row `id`), 8 (`pdfSheet`, Excel keeps full), 9 (toggle UI). F3 ordering → Tasks 1-5 (backend + column + endpoint + client), 6 (`(sort_order, name)` sort), 9 (drag table + persist). Default Name ASC → Task 6 sort with `sort_order` default 0. Deploy order → Tasks 4, 10.
- **Reorder/override interaction:** because price overrides and reordering share one table, Task 6b re-keys overrides by menu id so a drag never mis-assigns a price adjustment (a position key would follow the slot, not the item).
- **Type consistency:** `sort_order` (snake) on the wire/`Menu`/`db.Menu.SortOrder`; `SheetRow.id`; `Overrides` + `PartialRow.key` keyed by menu id (number); `filterExcluded(sheet, Set<number>)`; `reorderMenus(number|null, number[])`; `Branding.background`; `inkFor(string)`; page `move(number,…)`/`clearRow(number)` — all used consistently across tasks.
- **Known simplification:** cross-category ids in a reorder request are ignored by the SQL guard rather than rejected with an error (safer; can't corrupt another category).
