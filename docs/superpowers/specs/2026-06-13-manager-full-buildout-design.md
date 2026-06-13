# Manager Full Build-out — Design

**Date:** 2026-06-13
**Status:** Design — awaiting user review before implementation planning.

## 1. Goal

Build the remaining manager features in the `mulan-manager` SvelteKit app, reaching parity with the old Go `/manager/*` pages: **menu manager, option groups, members, cashiers, settings** (dashboard + discounts already shipped). Each feature spans backend auth-scoping + proxy allowlist + an iOS page. Built in one sweep off one spec.

Architecture is unchanged from the slice: browser → render (same-origin) → SvelteKit `/api/[...path]` proxy (cookie→bearer, Tailscale dispatcher) → Go backend on chaiyarak. Reuse the existing iOS component library and the `callBackend`/proxy/auth plumbing.

## 2. Backend auth-scoping

Currently only `/auth/*`, `/discounts`, `/dashboard` are protected; all other manager routes are OPEN on the tailnet. Apply the discounts model: **manager writes = `RequireRole(owner)`; POS-shared reads stay open; manager-only reads = `RequireManager`.**

Implementation: each feature handler gains granular registration methods instead of one `Routes(r)` — `PublicRoutes(r)` (open), `ManagerRoutes(r)` (any manager), `OwnerRoutes(r)` (owner writes). `main.go` mounts them into the existing three groups. Handler internals stay encapsulated (methods may stay unexported).

### Classification

**Stay OPEN (unchanged — POS/agent/shared):**
`GET /api/menus`, `GET /api/menu-categories`, `GET /api/settings`, `GET /api/settings/logo`, `GET /api/members/lookup`, `POST /api/cashiers/login`, all `/api/orders`, `/api/cash-drawer`, `/api/wifi`, `GET /api/discounts/active`, `POST /api/auth/login`.

**`RequireManager` (any logged-in manager, read):**
`GET /api/option-groups`, `GET /api/members`, `GET /api/members/{id}/orders`, `GET /api/cashiers`. (Plus existing `GET /api/discounts`, `/api/auth/me`, `/api/auth/logout`.)

**`RequireRole(owner)` (writes + owner data):**
- Menus: `POST /api/menus`, `PATCH /api/menus/{id}`, `PATCH /api/menus/{id}/toggle`, `DELETE /api/menus/{id}`, `PUT /api/menus/{id}/option-groups`, `PUT /api/menus/{id}/base-options`.
- Categories: `POST/PATCH/DELETE /api/menu-categories`.
- Option groups: `POST/PATCH/DELETE /api/option-groups`, `POST /api/option-groups/{id}/options`, `PATCH/DELETE /api/options/{id}`.
- Members: `POST/PATCH/DELETE /api/members`.
- Cashiers: `POST/PATCH/DELETE /api/cashiers`, `PATCH /api/cashiers/{id}/pin`.
- Settings: `PATCH /api/settings`, `PUT/DELETE /api/settings/logo`.
- (Plus existing discount writes + `/dashboard`.)

**Load-bearing verification (must do, not assume):**
- `GET /api/menus` and `GET /api/menu-categories` MUST stay open — POS renders the menu from them. Confirm with curl (no token → 200) after the change.
- Before protecting `GET /api/option-groups`, **grep the POS/agent code** (`mulan-agent/`, `templates/pos/`) to confirm it does NOT call `/api/option-groups` directly (it should get groups embedded in `/api/menus`). If POS does call it, keep it open instead.
- `/api/members/lookup` and `POST /api/cashiers/login` must remain reachable without a token.

## 3. Proxy allowlist

Add to `ALLOW` in `src/routes/api/[...path]/+server.ts`: `menus`, `menu-categories`, `option-groups`, `options`, `members`, `cashiers`, `settings`. (`dashboard`, `discounts`, `auth/me`, `auth/logout` already present.) Note: `settings/logo` GET is public/served as an image — the manager app can reference `/api/settings/logo` through the proxy for display, and `PUT`/`DELETE` go through the proxy with the bearer.

## 4. Navigation

Replace the 2-tab BottomTabBar with **4 tabs: Dashboard · Menu · Members · More**.

`More` (`/more`) is a grouped settings-style list:
```
Catalog
  Option Groups   >
  Discounts       >
Staff & Shop
  Cashiers        >
  Settings        >
```
Discounts moves under More (its page stays at `/discounts`). The `(app)` shell's `tabs` array changes; a new `MoreList`-style grouped list renders `/more`. Each existing/added page keeps its own NavBar with a large title; deep pages reached from More get a back affordance (iOS nav-style back to `/more`).

## 5. Pages

All pages live under the `(app)` group, reuse the iOS components + the typed-fetch pattern from `src/lib/api/discounts.ts`. Money is THB floats over the wire (backend converts satang↔THB); display with the existing `฿`/`toFixed(2)` helper, never do float math beyond display.

### 5.1 Menu Manager (`/menu`) — the complex one

Typed client `src/lib/api/menus.ts` (menus, categories, set-groups, set-base-options) + `src/lib/api/optionGroups.ts` (shared presets, reused by the option-groups page).

NavBar "Menu" with trailing **＋** (new item) and a **Categories** button. Body: items fetched from `GET /api/menus`, grouped by `category_id` into sections (category name headers from `GET /api/menu-categories`; null → "Uncategorized"). Row: name · `฿price` · an active badge; tapping the badge calls `PATCH /api/menus/{id}/toggle` (optimistic, re-fetch on settle).

**Item editor** (BottomSheet, scrollable) — create or edit:
- Fields: name, VFD name (≤20 chars), category (Picker), price (TextField, **greyed + ignored when base options exist**, with a note), active toggle.
- **Base Options** section: repeatable `{name, ฿price}` rows + "Add base option" + per-row delete. Empty-name rows dropped on save.
- **Option Groups** section: list of attached groups. **＋ Add** opens a Picker of shared presets (`GET /api/option-groups`) not yet attached, plus "New one-off group" (define an isolated group inline). Each attached group row:
  - A **Customize** toggle. Off = shared preset (its options shown read-only, "syncs with preset"). On = isolated clone: the preset's options copy into editable `{name, ±฿delta}` rows; edits stay private to this menu.
  - Remove (detach) action.
  - Editor state per entry: `{ kind: 'shared'|'isolated', sourceId?: number, name, selection_mode, options: [{name, price_delta}] }`.
- **Save** (sequential, surface which call failed — never partial-silent):
  1. `POST`/`PATCH /api/menus` (name, price, category_id, vfd_name) → get/confirm id.
  2. `PUT /api/menus/{id}/base-options` `{base_options:[{name, price}]}`.
  3. `PUT /api/menus/{id}/option-groups` `{groups:[…]}` where shared → `{isolated:false, id:sourceId}`, isolated → `{isolated:true, name, selection_mode, options:[{name, price_delta}]}`.
  On any step failure: stop, toast the failing step, leave the sheet open. Re-fetch list on success.
- Delete item (in edit mode, confirm).

**Inline creation of *shared* presets from the menu dialog is OUT of scope** (YAGNI) — to make a new shared preset, use the Option Groups page; the menu dialog supports attaching existing presets, customizing (isolating) them, and adding one-off isolated groups. This covers the real cases without the old UI's most tangled state.

**Categories sheet** (from the "Categories" button): list of categories with rename + delete, and an add row. CRUD via `/api/menu-categories`. Deleting a category leaves its items uncategorized (backend behavior).

### 5.2 Option Groups (`/option-groups`) — discounts-style

List of shared groups (name · selection_mode · option count). Add/edit BottomSheet: name, **SegmentedControl** selection_mode (`single_required`/`single_optional`/`multi`), and a repeatable option editor (`{name, ±฿delta}` rows with `sort_order` by position) backed by `POST /api/option-groups/{id}/options`, `PATCH/DELETE /api/options/{id}`. Create group via `POST /api/option-groups`; delete via `DELETE` (warns it orphans isolated clones on menus). Reuses `src/lib/api/optionGroups.ts`.

### 5.3 Members (`/members`) — discounts-style + detail

List + SearchBar (`GET /api/members?q=`). Row: name · phone · `points` badge. Add/edit BottomSheet: phone (numeric inputmode), name. 409 → "phone already registered" toast. Tapping a member opens a **detail sheet**: points balance + order history (`GET /api/members/{id}/orders` → `{code, created_at, points_earned, ฿subtotal}` rows) + delete.

### 5.4 Cashiers (`/cashiers`) — discounts-style

List (name · login_id · active badge). Add BottomSheet: login_id, name, PIN (≥4 digits), active. Edit BottomSheet: name + active (`PATCH`), plus a **Change PIN** action (`PATCH /api/cashiers/{id}/pin`). 409 on duplicate login_id. Delete.

### 5.5 Settings (`/settings`) — form, not a list

Loads `GET /api/settings`. Form fields: shop_name, vat_percent (0–100), receipt_footer (≤255), points_per_baht (≥0), each in iOS grouped-list rows. **Logo**: preview (`/api/settings/logo` via proxy), an upload control (`PUT /api/settings/logo`, multipart `file`, ≤2 MiB, png/jpeg/gif/webp/svg), and a remove (`DELETE`). Save = `PATCH /api/settings`. Owner-only writes (a staff session gets 403 on save — surface it).

## 6. New components

- `Picker.svelte` / `ActionSheet.svelte` — iOS-style selection (category, shared-group attach, selection_mode where a sheet fits better than segmented).
- `RepeatableRows.svelte` (or a per-use inline pattern) — add/remove rows for options, base options, member orders.
- `LogoUpload.svelte` — preview + file input + remove.
- `MoreList.svelte` + the `/more` page — grouped list rows with chevrons (reused for any future settings-style nav).
- Extend `ListRow`/`Card` only if needed; prefer composition over new primitives.

## 7. Testing

- vitest: typed-client URL/serialization helpers (e.g. the menu group-serialization shared↔isolated mapping — pure function, unit-tested).
- Playwright e2e (extend `e2e/`): owner logs in → Menu: create item with a category, attach a shared group, customize it, add a base option, save, see it listed; Members: create + search; Cashiers: create; Settings: change shop name. One spec per page or one combined manager-crud spec.
- Backend: after auth-scoping, curl matrix proving POS-open routes still 200 without a token and manager routes 401/403 appropriately (extend the existing verification).
- Manual: phone + desktop viewport; the menu editor sheet is the priority to exercise.

## 8. Plan decomposition (for writing-plans)

One spec, but implement as sequenced plans so each is independently verifiable:
1. **Backend auth-scoping** — granular handler routes + main.go wiring + POS-safety curl matrix + proxy allowlist additions.
2. **Navigation + shared components** — 4-tab bar, `/more` page, `Picker`/`ActionSheet`/`LogoUpload`/repeatable-rows; move Discounts under More.
3. **Simple CRUD pages** — option-groups, members, cashiers, settings (each a discounts-style page; settings is a form).
4. **Menu manager** — the item editor + categories + group-serialization, built last on the proven components.

## 9. Risks / reversibility

- **Blast radius:** the backend auth change touches every manager route group — could break POS if a shared read gets wrapped. Mitigated by the explicit OPEN list + the curl matrix (loud 401s, not silent). All additive on the frontend.
- **Reversibility:** backend route grouping is revertable per-feature; frontend is new pages + a nav change. No destructive data ops.
- **Menu manager complexity:** the option-group editor is the main risk; scoped down by dropping inline shared-preset creation. If the sheet grows unwieldy, split base-options and option-groups into their own sub-sheets.

## 10. Out of scope (YAGNI)

- Inline creation of shared option-group presets from the menu dialog (use the Option Groups page).
- Points redemption, order management UI, POS/agent changes, reordering via drag (sort_order set by row position only).
- Real-time SSE updates on manager pages (re-fetch after mutations).
