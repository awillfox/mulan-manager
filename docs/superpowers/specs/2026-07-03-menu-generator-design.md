# Menu Generator — Design

**Date:** 2026-07-03
**Status:** Approved (design), pending implementation plan

## Summary

A new manager feature that fetches all menus in the system and generates a
downloadable **A5 portrait PDF** printed menu, inspired by the café menu
reference design (centered title block, per-category price columns for drink
variants, category sections, right-aligned prices). Generation happens
entirely client-side with **pdfmake**; the user clicks **Download PDF** and gets
a `menu.pdf` file. No backend or proxy-ALLOW changes are required.

## Requirements (decided during brainstorming)

- **Fidelity:** Inspired by the reference, but simpler — keep the overall feel
  (cream background, uppercase spaced category headers, serif type, variant
  price columns) but not a pixel-match. True dotted price leaders are dropped
  (pdfmake has no native leader-dots); rows are clean name-left / price-right.
- **Orientation/size:** A5 **portrait** (148×210mm), 2-column body.
- **Menu scope:** **Active items only** (`active === true`).
- **Branding source:** Editable in the generator UI, Title prefilled from
  `settings.shop_name`.
- **PDF method:** Client-side one-click download via **pdfmake**.

## Data model mapping

The existing menu data maps cleanly onto the printed layout:

- **Categories** (`GET /api/menu-categories`) → menu **sections**
  (COFFEE, TEA, FOOD, …).
- **Menu items** (`GET /api/menus`) → **rows** within a section.
- An item's **`base_options`** (e.g. `Hot`/`Iced`/`Frappé`, each an absolute
  THB price) → the per-category **price columns**.
- Items with **no** `base_options` → a single right-aligned price from
  `menu.price` (like FOOD / ADD-ONS in the reference).

Both `/api/menus` and `/api/menu-categories` are already in the proxy `ALLOW`
list, so no proxy or backend changes are needed.

## Architecture / data flow

All client-side, on the `/menu-generator` page:

```
menus + categories ──buildMenuSheet()──▶ MenuSheet ──buildDocDefinition()──▶ pdfmake ──▶ preview iframe + Download
        (+ branding form input)          (pure, tested)      (pure, tested)     (lazy-loaded)
```

1. On load: `listMenus()` + `listCategories()` + `getSettings()` (for
   `shop_name` prefill).
2. `buildMenuSheet(menus, categories, branding)` — pure transform → `MenuSheet`.
3. `buildDocDefinition(sheet, branding)` — pure → pdfmake document definition.
4. `generatePdf(docDefinition)` — lazy-loads pdfmake + fonts, returns a
   data URL (preview) and a Blob (download).

## Components

### `src/lib/menu-pdf/model.ts` — the transform (pure, unit-tested)

`buildMenuSheet(menus: Menu[], categories: Category[], branding: Branding): MenuSheet`

- Filter to `active === true`.
- Group items by `category_id`, preserving the order of `categories`; drop
  categories with zero active items; `category_id === null` items collect into
  an **"Other"** section appended at the end.
- Per section, compute **variant columns**: the union of item `base_options`
  names, in first-appearance order across that section's items.
- Each item row carries:
  - `name`
  - if the section has variant columns: a price per column (blank where the
    item lacks that variant), from the matching `base_option.price`.
  - else: a single `price` from `menu.price`.
- A section where **no** item has `base_options` has an empty `columns` array
  and renders as simple `name … price` rows.

Types (sketch):

```ts
interface Branding {
  title: string;      // prefilled from shop_name
  tagline: string;    // e.g. "SINCE 2016"
  subtitle: string;   // e.g. "Gallery & Café"
  hours: string;      // e.g. "Open daily · 8am – 6pm"
  footer: string;     // e.g. "All prices in Thai Baht (฿)"
}
interface SheetRow {
  name: string;
  prices: (number | null)[]; // length === section.columns.length, OR
  single: number | null;     // used when columns is empty
}
interface SheetSection {
  title: string;
  columns: string[];         // variant column headers; [] for simple list
  rows: SheetRow[];
}
interface MenuSheet {
  sections: SheetSection[];
}
```

### `src/lib/menu-pdf/pdf.ts` — the builder (pure builder + lazy generate)

`buildDocDefinition(sheet: MenuSheet, branding: Branding): TDocumentDefinitions`
(pure, unit-tested)

- `pageSize: 'A5'`, `pageOrientation: 'portrait'`, page margins tuned for print.
- Cream page background via a full-page background rectangle.
- Header stack (centered): tagline, Title, subtitle.
- Footer: hours + footer note.
- Body in **2 balanced columns**: each section is an atomic block
  (uppercase spaced header + rows table). Blocks are distributed left/right by
  estimated height using a greedy longest-processing-time split.
- Variant sections render a small `HOT / ICED / FRAPPÉ`-style sub-header row and
  right-aligned price cells; simple sections render name-left / price-right.
- Money formatting: whole baht (`฿75`) when integer, 2 decimals otherwise.

`generatePdf(docDefinition): Promise<{ dataUrl: string; blob: Blob }>`

- Lazy-`import('pdfmake/build/pdfmake')`.
- Register Noto Serif Thai VFS + fonts (see below).
- Return `getDataUrl` (preview) + `getBlob` (download).

**Known limitation:** pdfmake's `columns` node does not auto-flow content across
pages. Column balancing is optimized for the first page; a very long menu
spilling onto a second page may be slightly uneven. Acceptable for the current
scale (~8 categories / ~60 items).

### `src/lib/menu-pdf/fonts.ts` — Thai-capable font embedding

- Embed **Noto Serif Thai** (Regular + Bold, OFL) — serif *and* Thai coverage in
  one family, so Thai menu/branding text renders correctly.
- TTFs live in `static/fonts/NotoSerifThai-Regular.ttf` and
  `NotoSerifThai-Bold.ttf`.
- At generate-time, fetch the TTFs from `/fonts/…`, base64-encode, register into
  `pdfMake.vfs`, and map the `pdfMake.fonts` family (italics → Regular,
  bolditalics → Bold, since the family ships no italic).
- Lazy-loaded with pdfmake so the main app bundle is unaffected.

### `src/routes/(app)/menu-generator/+page.svelte` — the UI

- iOS `NavBar` titled "Menu Generator".
- Branding form (iOS `TextField`s): Title (prefill `shop_name`), Tagline,
  Subtitle, Hours, Footer note.
- Live **preview** in an `<iframe>` fed by the pdfmake data URL, regenerated
  (debounced) when branding or data changes.
- **Download PDF** button → downloads `menu.pdf`; shows `Spinner` while the
  font/lib load and the doc renders.
- Standard loading / error / empty states matching existing pages.

### `src/routes/(app)/more/+page.svelte` — entry point

- Add one `ListRow` "Menu Generator" under the **Catalog** group linking to
  `/menu-generator`.

## New dependency

- `pdfmake` (runtime) + `@types/pdfmake` (dev).

## Testing

Vitest unit tests, matching the existing `menuGroups` / `optionGroups` spec
pattern:

- `src/lib/menu-pdf/model.spec.ts` — `buildMenuSheet`:
  - filters out inactive items,
  - groups by category in category order, drops empty categories,
  - `category_id: null` → "Other" section at the end,
  - variant-column union + per-column price alignment (blank where missing),
  - single-price fallback when a section has no base_options.
- `src/lib/menu-pdf/pdf.spec.ts` — `buildDocDefinition`:
  - page size A5 / portrait,
  - section count matches sheet,
  - header (title/tagline) and footer present.

No new e2e tests.

## Out of scope (YAGNI)

- Per-category include/exclude toggles or drag-reorder (use backend order).
- Storing extra branding fields in backend Settings.
- Server-side / headless-Chromium generation.
- True dotted price leaders.
- Multi-page column re-balancing.
