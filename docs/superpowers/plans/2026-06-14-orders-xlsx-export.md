# Orders .xlsx Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Export .xlsx" button on `/orders` that downloads all orders matching the current filter (date range + status) as an Excel file, generated in the browser.

**Architecture:** A pure `ordersToRows()` mapper (node-testable), a `listAllOrders()` paginator that loops the existing endpoint past the 200-row cap, and a browser-only `exportOrdersXlsx()` that builds a `write-excel-file` schema (dynamic-imported) and triggers the download. The `/orders` page gets a button + `exporting` state.

**Tech Stack:** SvelteKit, Svelte 5 runes, `write-excel-file`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-14-orders-xlsx-export-design.md`

**Branch:** create `feat/orders-xlsx` off `main` in `mulan-manager` (the orders feature is already merged to `main`).

**Test commands:** one file `npm run test:unit -- --run <path>` · `npm run check` · `npm run build`.

---

## File Structure

| File                                            | Responsibility                                              |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `package.json` (modify)                         | add `write-excel-file`                                      |
| `src/lib/export/ordersRows.ts` (new)            | pure `ExportRow` type + `ordersToRows()`                    |
| `src/lib/export/ordersRows.spec.ts` (new)       | unit test for `ordersToRows`                                |
| `src/lib/api/reports.ts` (modify)               | add `listAllOrders()` paginator                             |
| `src/lib/api/reports.spec.ts` (modify)          | add `listAllOrders` tests                                   |
| `src/lib/export/ordersXlsx.ts` (new)            | browser-only `exportOrdersXlsx()` (dynamic-imports the lib) |
| `src/routes/(app)/orders/+page.svelte` (modify) | Export button + `exporting` state                           |

`ordersToRows` lives in its OWN file (not `ordersXlsx.ts`) so the node unit test never loads the browser-only `write-excel-file`.

---

## Task 1: Install `write-excel-file`

**Files:** Modify `package.json`.

- [ ] **Step 1: Install**

Run: `npm install write-excel-file`
Expected: `write-excel-file` appears in `dependencies`; lockfile updated.

- [ ] **Step 2: Sanity build**

Run: `npm run check`
Expected: still 0 errors (no usage yet).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(manager): add write-excel-file dep"
```

(End every commit body with:
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>)

---

## Task 2: Pure `ordersToRows()` + test

**Files:** Create `src/lib/export/ordersRows.ts`, `src/lib/export/ordersRows.spec.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/export/ordersRows.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ordersToRows } from './ordersRows';
import type { OrderRow } from '$lib/api/reports';

const sample: OrderRow = {
	code: 'AAA',
	status: 'paid',
	created_at: '2026-06-14T15:13:40+07:00',
	member_name: 'Cream',
	member_phone: '08',
	points_earned: 9,
	item_count: 2,
	qty: 3,
	gross: 90,
	discount: 20,
	subsidy: 0,
	net: 70,
	line_items: [],
	discounts: []
};

describe('ordersToRows', () => {
	it('maps an order to an export row', () => {
		const rows = ordersToRows([sample]);
		expect(rows).toHaveLength(1);
		const r = rows[0];
		expect(r.code).toBe('AAA');
		expect(r.status).toBe('paid');
		expect(r.member).toBe('Cream');
		expect(r.phone).toBe('08');
		expect(r.points).toBe(9);
		expect(r.items).toBe(3);
		expect(r.gross).toBe(90);
		expect(r.discount).toBe(20);
		expect(r.subsidy).toBe(0);
		expect(r.net).toBe(70);
		expect(r.date instanceof Date).toBe(true);
		expect(r.date.getTime()).toBe(new Date('2026-06-14T15:13:40+07:00').getTime());
	});
	it('maps an empty list to no rows', () => {
		expect(ordersToRows([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/export/ordersRows.spec.ts`
Expected: FAIL — cannot resolve `./ordersRows`.

- [ ] **Step 3: Implement**

Create `src/lib/export/ordersRows.ts`:

```ts
import type { OrderRow } from '$lib/api/reports';

export interface ExportRow {
	date: Date;
	code: string;
	status: string;
	member: string;
	phone: string;
	points: number;
	items: number;
	gross: number;
	discount: number;
	subsidy: number;
	net: number;
}

export function ordersToRows(orders: OrderRow[]): ExportRow[] {
	return orders.map((o) => ({
		date: new Date(o.created_at),
		code: o.code,
		status: o.status,
		member: o.member_name,
		phone: o.member_phone,
		points: o.points_earned,
		items: o.qty,
		gross: o.gross,
		discount: o.discount,
		subsidy: o.subsidy,
		net: o.net
	}));
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/export/ordersRows.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/ordersRows.ts src/lib/export/ordersRows.spec.ts
git commit -m "feat(manager): pure ordersToRows mapper (TDD)"
```

---

## Task 3: `listAllOrders()` paginator + test

**Files:** Modify `src/lib/api/reports.ts`, `src/lib/api/reports.spec.ts`.

- [ ] **Step 1: Add the failing test**

Append to `src/lib/api/reports.spec.ts` (keep the existing `ordersQS` tests; add these imports/tests):

```ts
import { afterEach, vi } from 'vitest';
import { listAllOrders } from './reports';
import type { OrderRow } from './reports';

function mk(code: string): OrderRow {
	return {
		code,
		status: 'paid',
		created_at: '',
		member_name: '',
		member_phone: '',
		points_earned: 0,
		item_count: 0,
		qty: 0,
		gross: 0,
		discount: 0,
		subsidy: 0,
		net: 0,
		line_items: [],
		discounts: []
	};
}

function mockPages(pages: { orders: OrderRow[]; total: number }[]) {
	let call = 0;
	globalThis.fetch = vi.fn(async () => ({
		ok: true,
		json: async () => ({ data: pages[call++] })
	})) as unknown as typeof fetch;
}

describe('listAllOrders', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('accumulates all pages until total is reached', async () => {
		mockPages([
			{ orders: [mk('a'), mk('b')], total: 3 },
			{ orders: [mk('c')], total: 3 }
		]);
		const all = await listAllOrders({ from: '2026-06-01', to: '2026-06-14' });
		expect(all.map((o) => o.code)).toEqual(['a', 'b', 'c']);
	});

	it('stops when a page returns empty (guards infinite loop)', async () => {
		mockPages([{ orders: [], total: 5 }]);
		const all = await listAllOrders({ from: '2026-06-01', to: '2026-06-14' });
		expect(all).toEqual([]);
	});
});
```

(If the file's existing top imports already import from `'vitest'`, merge `afterEach, vi` into that import instead of adding a duplicate line. Keep one `import ... from 'vitest'`.)

- [ ] **Step 2: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/api/reports.spec.ts`
Expected: FAIL — `listAllOrders` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/api/reports.ts`, append after the existing `listOrders` export:

```ts
const EXPORT_PAGE = 200;

// listAllOrders fetches every order matching the filter by paging the endpoint
// (which caps limit at 200) until it has `total` rows. Stops if a page returns
// empty, so a bad total can't spin forever.
export async function listAllOrders(q: Omit<OrdersQuery, 'limit' | 'offset'>): Promise<OrderRow[]> {
	const all: OrderRow[] = [];
	let offset = 0;
	for (;;) {
		const page = await listOrders({ ...q, limit: EXPORT_PAGE, offset });
		all.push(...page.orders);
		offset += page.orders.length;
		if (page.orders.length === 0 || all.length >= page.total) break;
	}
	return all;
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/api/reports.spec.ts`
Expected: PASS (existing `ordersQS` + 2 new `listAllOrders` tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/reports.ts src/lib/api/reports.spec.ts
git commit -m "feat(manager): listAllOrders paginator (TDD)"
```

---

## Task 4: `exportOrdersXlsx()` + Export button

**Files:** Create `src/lib/export/ordersXlsx.ts`; Modify `src/routes/(app)/orders/+page.svelte`.

- [ ] **Step 1: Implement the export builder**

Create `src/lib/export/ordersXlsx.ts`:

```ts
import type { OrderRow } from '$lib/api/reports';
import { ordersToRows, type ExportRow } from './ordersRows';

// exportOrdersXlsx builds the worksheet from order rows and triggers a browser
// download. write-excel-file is dynamic-imported so it never loads during SSR
// or in the initial bundle.
export async function exportOrdersXlsx(orders: OrderRow[], fileName: string): Promise<void> {
	const { default: writeXlsxFile } = await import('write-excel-file');
	const rows = ordersToRows(orders);

	const schema = [
		{
			column: 'Date',
			type: Date,
			format: 'dd/mm/yyyy hh:mm',
			width: 16,
			value: (r: ExportRow) => r.date
		},
		{ column: 'Code', type: String, width: 12, value: (r: ExportRow) => r.code },
		{ column: 'Status', type: String, width: 8, value: (r: ExportRow) => r.status },
		{ column: 'Member', type: String, width: 16, value: (r: ExportRow) => r.member },
		{ column: 'Phone', type: String, width: 14, value: (r: ExportRow) => r.phone },
		{ column: 'Points', type: Number, format: '0', width: 8, value: (r: ExportRow) => r.points },
		{ column: 'Items', type: Number, format: '0', width: 6, value: (r: ExportRow) => r.items },
		{
			column: 'Gross',
			type: Number,
			format: '#,##0.00',
			width: 12,
			value: (r: ExportRow) => r.gross
		},
		{
			column: 'Discount',
			type: Number,
			format: '#,##0.00',
			width: 12,
			value: (r: ExportRow) => r.discount
		},
		{
			column: 'Subsidy',
			type: Number,
			format: '#,##0.00',
			width: 12,
			value: (r: ExportRow) => r.subsidy
		},
		{ column: 'Net', type: Number, format: '#,##0.00', width: 12, value: (r: ExportRow) => r.net }
	];

	await writeXlsxFile(rows, { schema, fileName });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: 0 errors. If `write-excel-file`'s `Schema` generic rejects the inline `schema` array (its column-type unions can be strict), import its type and annotate: `import type { Schema } from 'write-excel-file';` then `const schema: Schema<ExportRow> = [ ... ]`. If that still fights, cast at the call: `await writeXlsxFile(rows, { schema: schema as never, fileName });` — runtime behavior is unaffected. Report whichever you used.

- [ ] **Step 3: Wire the button into the page**

In `src/routes/(app)/orders/+page.svelte`:

(a) Add imports next to the existing `listOrders` import:

```ts
import { listOrders, listAllOrders, type OrderRow } from '$lib/api/reports';
import { exportOrdersXlsx } from '$lib/export/ordersXlsx';
```

(replace the existing `import { listOrders, type OrderRow } from '$lib/api/reports';` line with the first line above).

(b) Add state + handler (next to the other `$state` declarations / `load` function):

```ts
let exporting = $state(false);

async function exportXlsx() {
	exporting = true;
	try {
		const { from, to } = range();
		const all = await listAllOrders({ from, to, status: status || undefined });
		const name = `orders-${from}-to-${to}${status ? '-' + status : ''}.xlsx`;
		await exportOrdersXlsx(all, name);
	} catch (e) {
		showToast((e as Error).message, 'error');
	} finally {
		exporting = false;
	}
}
```

(c) Replace the existing count line:

```svelte
<p class="px-1 text-xs text-[var(--ios-label-secondary)]">{orders.length} of {total}</p>
```

with a flex row holding the count + the Export button:

```svelte
<div class="flex items-center justify-between px-1">
	<p class="text-xs text-[var(--ios-label-secondary)]">{orders.length} of {total}</p>
	<button
		class="text-sm font-medium text-[var(--ios-blue)] disabled:opacity-50"
		disabled={exporting || orders.length === 0}
		onclick={exportXlsx}
	>
		{exporting ? 'Exporting…' : 'Export .xlsx'}
	</button>
</div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run check`
Expected: 0 errors.
Run: `npm run build`
Expected: success (confirms the dynamic import + SSR are fine).

- [ ] **Step 5: Commit**

```bash
git add src/lib/export/ordersXlsx.ts 'src/routes/(app)/orders/+page.svelte'
git commit -m "feat(manager): export orders to .xlsx (current filter)"
```

---

## Task 5: Full verification

**Files:** none.

- [ ] **Step 1: Tests + check + build**

Run: `npm run test:unit -- --run && npm run check && npm run build`
Expected: all tests pass, 0 type errors, build succeeds.

- [ ] **Step 2: Format branch files**

Run: `git diff --name-only main HEAD | while read f; do [ -f "$f" ] && echo "$f"; done | xargs npx prettier --write`
Then commit if anything changed:

```bash
git commit -am "chore(manager): prettier format xlsx export" || echo "nothing to format"
```

- [ ] **Step 3: Manual**

`npm run dev`, logged in, on `/orders`:

- Set a filter (status + range), click **Export .xlsx** → a file `orders-<from>-to-<to>[-<status>].xlsx` downloads.
- Open it: header row + one row per order, money columns are numeric (`#,##0.00`), Date sorts as a date, row count equals the filter's `total` (not just the loaded page).
- Trigger a fetch error (e.g. stop the backend) → a toast shows; button re-enables.

---

## Self-Review notes

- **Spec coverage:** client-side generation (T1,T4) ✓; one row per order + 11 columns (T2 mapper, T4 schema) ✓; all rows for current filter via paginator (T3) ✓; money as numbers w/ `#,##0.00`, Date type (T4 schema) ✓; button + exporting state + filename + toast (T4) ✓; uses page's `range()`/`status` (T4) ✓.
- **Type consistency:** `ExportRow` fields (T2) ↔ schema `value` fns (T4); `OrderRow` reused from `reports.ts`; `listAllOrders(Omit<OrdersQuery,'limit'|'offset'>)` (T3) ↔ called with `{from,to,status}` (T4); `ordersToRows` signature T2 ↔ used in T4.
- **Refinement vs spec:** `ordersToRows` split into `ordersRows.ts` (pure, no lib) so its node test doesn't import the browser-only lib; `exportOrdersXlsx` dynamic-imports `write-excel-file` (SSR/bundle safety). Noted in File Structure.
- **Known risk:** `write-excel-file` TS `Schema` typing — T4 Step 2 gives the fallback (annotate `Schema<ExportRow>` or cast).

```

```
