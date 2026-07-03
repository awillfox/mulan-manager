# Menu Generator enhancements: background, exclude, ordering

**Date:** 2026-07-03
**Status:** Approved (design)
**Repos:** `mulan-manager` (frontend) + `mulan` (Go backend, `../mulan`)

Three features, delivered together.

1. **Selectable PDF background** — color picker, text color auto-chosen for contrast. Frontend only.
2. **Exclude items from the PDF** — generator-only, **PDF output only** (Excel keeps everything). Frontend only, in-memory.
3. **Persisted item ordering** — drag-and-drop, default **Menu Name A→Z**, saved to the backend. Backend (DB migration) + frontend.

---

## Feature 1 — PDF background

- **`model.ts`**: add `background: string` to `Branding` (default `#f3ead8`, today's cream).
- **`pdf.ts`**: new pure `inkFor(bg: string): string` — perceived luminance
  `(0.299R + 0.587G + 0.114B) / 255`; `≥ 0.6` → dark ink `#2b2b2b`, else light ink
  `#f7f2e8`. `buildDocDefinition` uses `b.background` for the full-page rect and
  `inkFor(b.background)` for `defaultStyle.color` and the footer color (replacing the
  fixed `CREAM`/`INK`, which remain as the defaults).
- **`+page.svelte`**: a "Background" row in the Branding card — native
  `<input type="color">` bound to `brand.background`. Preview re-renders reactively.
- **Test**: `pdf.spec.ts` — `inkFor` returns dark on light bg, light on dark bg, and
  the correct side of the threshold.

## Feature 2 — Exclude items from the PDF

- Client-side `excluded = $state(new Set<number>())` — **in-memory only**, never sent
  to the backend, not persisted across reloads (matches the existing price-override
  pattern).
- **`model.ts`**: add `id: number` to `SheetRow` so a sheet row is addressable by its
  menu id.
- New pure `filterExcluded(sheet: MenuSheet, excluded: Set<number>): MenuSheet` — drops
  rows whose `id` is excluded and drops any section left with zero rows.
- **PDF path only**: `pdfSheet = filterExcluded(effectiveSheet, excluded)` feeds the
  preview and Download PDF. **Excel** keeps building from the full `effectiveSheet`
  (excluded items still export). This is the deliberate "PDF only" decision.
- **UI**: an exclude toggle per row in the combined Items table (Feature 3). Excluded
  rows render dimmed + strike-through.
- **Test**: `filterExcluded` drops the right rows and prunes emptied sections.

## Feature 3 — Persisted item ordering (drag-and-drop, default Name ASC)

### Backend (`../mulan`) — mirrors the existing base-options `sort_order` pattern

- **`schema.hcl`**: add `sort_order integer NOT NULL DEFAULT 0` to `menus`; add index
  on `(category_id, sort_order)`. Apply with `task migrate-dev` → `task migrate-prod`;
  regenerate `schema.sql` (`task generate-sql-schema`).
- **`internal/sql/menus.query.sql`**: `ListMenus` → `ORDER BY category_id, sort_order,
  name`; add `sort_order` to the SELECT column list and to `Create/Update/Toggle`
  `RETURNING`.
- **`internal/sql/menus.command.sql`**: new
  `-- name: SetMenuSortOrder :exec` → `UPDATE menus SET sort_order = $2 WHERE id = $1`.
- **Menu service** (`internal/menu/service`): `SetMenuOrder(ctx, categoryID *int32,
  orderedIDs []int32)` — in a transaction, validate every id belongs to `categoryID`
  (reject otherwise), then `SetMenuSortOrder(id, index)` for `index, id := range
  orderedIDs`. Assign `index + 1` so a freshly-created item (default `0`) sorts to the
  top of its category by name until placed.
- **sqlc**: `task sqlcgen` → `Menu` model gains `SortOrder int32`.
- **DTO** (`internal/menu/http/handler.go`): `menuResponse` gains
  `SortOrder int32 \`json:"sort_order"\``; set it in the row→response mapper.
- **Handler + route**: `Reorder(w, r)` decodes `{ category_id: *int32, ordered_ids:
  []int32 }`, calls the service, returns `204`. Register `PATCH /menus/reorder` in the
  **owner-only** write group in `main.go` (alongside the other `menus` writes).
- **Tests**: service reorder (order assigned, cross-category id rejected) + handler.

### Frontend (`mulan-manager`)

- **`api/menus.ts`**: `Menu` gains `sort_order: number`; new
  `reorderMenus(categoryId: number | null, orderedIds: number[])` → `PATCH
  /api/menus/reorder`. Confirm the `menus/` prefix in the proxy `ALLOW` list already
  covers `menus/reorder`.
- **`model.ts`** `buildMenuSheet`: sort each category's items by `(sort_order, name)`,
  so the default (all `0`) is Name A→Z. (Backend already orders; sort defensively.)
- **Combined Items table** in `/menu-generator` — replaces the current "Adjust variant
  columns" section (which only lists partial-price rows):
  - Per category: **all** items, sorted, each row = drag handle
    (`svelte-dnd-action`) · name · exclude toggle (Feature 2) · variant price cells,
    plus the existing partial-price `‹ ›` / place controls.
  - Price cells are looked up per item id from a `Map<id, SheetRow>` built off
    `effectiveSheet` (decouples ordering from price display).
  - Drag reorders **within one category only**. On finalize: update the local `menus`
    order/`sort_order`, call `reorderMenus`, then re-fetch menus (server is source of
    truth). Changing an item's category stays in the item editor, out of scope here.
- **Dependency**: add `svelte-dnd-action` (touch-friendly drag for the phone-first UI).

### Data flow

```
menus $state (re-fetched after reorder)
  ├─ buildMenuSheet + applyOverrides ─▶ effectiveSheet (full)
  │      ├─▶ Excel export (unfiltered — excluded items still export)
  │      ├─▶ Map<id, SheetRow>  (price cells for the Items table)
  │      └─▶ filterExcluded(excluded) ─▶ pdfSheet ─▶ PDF preview + download
  └─ grouped by category (with ids) ─▶ Items table rows (drag order + exclude)
```

## Out of scope

- Reordering categories themselves; cross-category drag.
- Persisting the background, exclude set, or price-column overrides (all in-memory
  generator state).
- Excel excluding items (PDF only, per decision).

## Testing

- **Frontend unit**: `inkFor`, `filterExcluded`, `buildMenuSheet` ordering by
  `(sort_order, name)`.
- **Backend**: reorder service (order assignment + cross-category rejection) + handler.
- **Manual**: drag to reorder, reload, confirm order persists; confirm excluded items
  vanish from the PDF but remain in the Excel; confirm background + text contrast.

## Deploy

- **Backend**: `task migrate-prod`, then deploy `mulan`.
- **Frontend**: push to `main` → render auto-deploy.
- Order: migrate + deploy backend first (adds `sort_order`), then frontend.
