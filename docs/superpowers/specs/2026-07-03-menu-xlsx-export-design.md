# Menu Generator — Export as `.xlsx`

**Date:** 2026-07-03
**Status:** Approved

## Goal

Add an Excel (`.xlsx`) download to the Menu Generator page, alongside the existing
PDF download. The spreadsheet reuses the same print model the PDF is built from, so
it reflects the user's variant-column adjustments.

## Design

### Source data

Reuse `effectiveSheet` (a `MenuSheet` with the user's overrides applied) from
`src/lib/menu-pdf/model.ts` / `overrides.ts`. No new transform of the raw menus —
the sheet model is already the right shape (sections → columns → rows).

### Workbook layout

- **One worksheet tab per category** (`SheetSection`). Section order = model order
  (categories first, `Other` last).
- **Data table only** — no branding rows, no styling.
- Header row:
  - Variant section (`columns.length > 0`): `Name`, then each variant column
    (`Hot`, `Iced`, `Frappé` — using the same display label as the PDF, `columnLabel`).
  - Plain section (`columns.length === 0`): `Name`, `Price`.
- Item rows: name in column A; prices as **numbers**. A null / absent variant price
  is an **empty cell** (real blank, not `—`). Flat-priced items in a variant section
  put their single price in whichever column the override placed it (already encoded
  in the row's `prices`/`single` after `applyOverrides`).
- **Tab names** sanitized for Excel: strip `: \ / ? * [ ]`, trim to ≤31 chars,
  de-duplicate collisions (`Name`, `Name (2)`, …).

### Library

`write-excel-file` v4 (MIT) — lightweight, browser-first, multi-sheet. Runs
client-side on button click, same as pdfmake. No SSR concern (only called in the
browser).

### Code shape

- New `src/lib/menu-pdf/xlsx.ts`:
  - `buildRows(section: SheetSection): Row[]` — pure, testable header+body builder.
  - `sheetNames(sections): string[]` — sanitize + de-dupe.
  - `buildMenuWorkbook(sheet: MenuSheet): Promise<Blob>` — assemble and write.
- `src/routes/(app)/menu-generator/+page.svelte`:
  - Add a **Download Excel** button next to Download PDF.
  - `downloadXlsx()` builds the blob on demand from `effectiveSheet` and triggers a
    download of `menu.xlsx`. No live preview for Excel.

### Testing

`src/lib/menu-pdf/xlsx.spec.ts` — assert `buildRows` header/body cell values for a
variant section and a plain section, and `sheetNames` sanitization/de-dup. Mirrors
`model.spec.ts` style.

## Out of scope

Branding header rows, cell styling/formatting, backend changes, live Excel preview.
