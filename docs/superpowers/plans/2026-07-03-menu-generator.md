# Menu Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manager "Menu Generator" page that fetches all active menus and downloads an A5-portrait PDF printed menu inspired by the café reference design.

**Architecture:** Fully client-side. Two pure functions — `buildMenuSheet` (raw menus+categories → print model) and `buildDocDefinition` (print model → pdfmake doc) — are unit-tested in Node. A thin `generatePdf` glue lazy-loads pdfmake + an embedded Thai-capable font and renders to a preview data URL + a downloadable Blob. A Svelte 5 page wires it together; one link is added under More → Catalog.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, `pdfmake`, Sarabun font (TTF), vitest.

## Global Constraints

- **Money is THB floats**; display only. Menu prices render as `฿75` when integer, `฿75.50` otherwise (printed-menu style — deliberately drops the `.00` the `฿n.toFixed(2)` convention uses elsewhere).
- **No backend or proxy-ALLOW changes.** Reuse `/api/menus`, `/api/menu-categories`, `/api/settings` (all already allowlisted).
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`), `onMount` for data load. Match existing page idiom (see `src/routes/(app)/more/+page.svelte`).
- **iOS component library** under `src/lib/components/ios/` (imported per-component, no barrel). Touch targets ≥44px.
- **Font = Sarabun** (Regular/Bold/Italic/BoldItalic, OFL). This supersedes the spec's "Noto Serif Thai" note: Sarabun ships reliable **static** TTFs (Noto Serif Thai is only distributed as a variable font, which pdfmake/fontkit handles poorly). Sarabun covers Latin + Thai; the elegant feel comes from uppercase letter-spaced headers. Menu/branding text may be Thai, so embedding a Thai-capable font is required.
- **pdfmake is lazy-loaded** (`await import(...)`) inside `generatePdf` only — never at module top level — so the main bundle and SSR are unaffected.
- Only active items (`active === true`) appear on the PDF.

---

### Task 1: Add pdfmake dependency, Sarabun font assets, and font loader

**Files:**
- Modify: `package.json` (via npm install)
- Create: `static/fonts/Sarabun-Regular.ttf`, `Sarabun-Bold.ttf`, `Sarabun-Italic.ttf`, `Sarabun-BoldItalic.ttf`
- Create: `src/lib/menu-pdf/fonts.ts`

**Interfaces:**
- Produces: `loadFonts(): Promise<{ vfs: Record<string, string>; fonts: TFontDictionary }>` — consumed by `generatePdf` in Task 3.

- [ ] **Step 1: Install pdfmake**

```bash
npm install pdfmake
npm install -D @types/pdfmake
```

- [ ] **Step 2: Download the four static Sarabun TTFs into `static/fonts/`**

```bash
mkdir -p static/fonts
base="https://github.com/google/fonts/raw/main/ofl/sarabun"
curl -fL "$base/Sarabun-Regular.ttf"    -o static/fonts/Sarabun-Regular.ttf
curl -fL "$base/Sarabun-Bold.ttf"       -o static/fonts/Sarabun-Bold.ttf
curl -fL "$base/Sarabun-Italic.ttf"     -o static/fonts/Sarabun-Italic.ttf
curl -fL "$base/Sarabun-BoldItalic.ttf" -o static/fonts/Sarabun-BoldItalic.ttf
```

Verify each is a real TTF (not an HTML error page):

```bash
file static/fonts/Sarabun-*.ttf
```
Expected: each line reports `TrueType Font data` (or `TrueType font`), size > 40 KB.

- [ ] **Step 3: Write the font loader `src/lib/menu-pdf/fonts.ts`**

```ts
import type { TFontDictionary } from 'pdfmake/interfaces';

// vfs key (pdfmake virtual filename) -> static asset URL served by SvelteKit
const FILES: Record<string, string> = {
	'Sarabun-Regular.ttf': '/fonts/Sarabun-Regular.ttf',
	'Sarabun-Bold.ttf': '/fonts/Sarabun-Bold.ttf',
	'Sarabun-Italic.ttf': '/fonts/Sarabun-Italic.ttf',
	'Sarabun-BoldItalic.ttf': '/fonts/Sarabun-BoldItalic.ttf'
};

let cache: { vfs: Record<string, string>; fonts: TFontDictionary } | null = null;

async function toBase64(url: string): Promise<string> {
	const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
	// Chunked to avoid blowing the call stack on String.fromCharCode(...bigArray).
	let bin = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < buf.length; i += CHUNK) {
		bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

export async function loadFonts() {
	if (cache) return cache;
	const entries = await Promise.all(
		Object.entries(FILES).map(async ([name, url]) => [name, await toBase64(url)] as const)
	);
	const vfs = Object.fromEntries(entries);
	const fonts: TFontDictionary = {
		Sarabun: {
			normal: 'Sarabun-Regular.ttf',
			bold: 'Sarabun-Bold.ttf',
			italics: 'Sarabun-Italic.ttf',
			bolditalics: 'Sarabun-BoldItalic.ttf'
		}
	};
	cache = { vfs, fonts };
	return cache;
}
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: PASS (0 errors). `pdfmake/interfaces` resolves via `@types/pdfmake`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json static/fonts src/lib/menu-pdf/fonts.ts
git commit -m "feat(menu-generator): add pdfmake + Sarabun fonts and loader"
```

---

### Task 2: The print-model transform (`buildMenuSheet`)

**Files:**
- Create: `src/lib/menu-pdf/model.ts`
- Test: `src/lib/menu-pdf/model.spec.ts`

**Interfaces:**
- Consumes: `Menu` from `$lib/api/menus`, `Category` from `$lib/api/categories` (type-only imports).
- Produces:
  - `interface Branding { title: string; tagline: string; subtitle: string; hours: string; footer: string }`
  - `interface SheetRow { name: string; prices: (number | null)[]; single: number | null }`
  - `interface SheetSection { title: string; columns: string[]; rows: SheetRow[] }`
  - `interface MenuSheet { sections: SheetSection[] }`
  - `buildMenuSheet(menus: Menu[], categories: Category[]): MenuSheet`

- [ ] **Step 1: Write the failing test `src/lib/menu-pdf/model.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildMenuSheet } from './model';
import type { Menu } from '$lib/api/menus';
import type { Category } from '$lib/api/categories';

function menu(p: Partial<Menu>): Menu {
	return {
		id: 1,
		name: 'X',
		price: 0,
		category_id: null,
		vfd_name: '',
		active: true,
		favourite: false,
		option_groups: [],
		base_options: [],
		...p
	};
}

const cats: Category[] = [
	{ id: 10, name: 'Coffee' },
	{ id: 20, name: 'Food' },
	{ id: 30, name: 'Empty' }
];

describe('buildMenuSheet', () => {
	it('drops inactive items', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'On', price: 50, category_id: 20, active: true }),
				menu({ id: 2, name: 'Off', price: 60, category_id: 20, active: false })
			],
			cats
		);
		const food = sheet.sections.find((s) => s.title === 'Food')!;
		expect(food.rows.map((r) => r.name)).toEqual(['On']);
	});

	it('groups by category in category order and drops empty categories', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Pancake', price: 80, category_id: 20 }),
				menu({ id: 2, name: 'Latte', price: 80, category_id: 10 })
			],
			cats
		);
		expect(sheet.sections.map((s) => s.title)).toEqual(['Coffee', 'Food']);
	});

	it('puts uncategorised items in an "Other" section at the end', () => {
		const sheet = buildMenuSheet(
			[
				menu({ id: 1, name: 'Latte', price: 80, category_id: 10 }),
				menu({ id: 2, name: 'Mystery', price: 20, category_id: null })
			],
			cats
		);
		expect(sheet.sections.map((s) => s.title)).toEqual(['Coffee', 'Other']);
	});

	it('builds variant columns as the union of base_option names in first-appearance order', () => {
		const sheet = buildMenuSheet(
			[
				menu({
					id: 1,
					name: 'Americano',
					category_id: 10,
					base_options: [
						{ name: 'Hot', price: 75 },
						{ name: 'Iced', price: 85 }
					]
				}),
				menu({
					id: 2,
					name: 'Espresso',
					category_id: 10,
					base_options: [
						{ name: 'Hot', price: 75 },
						{ name: 'Iced', price: 90 },
						{ name: 'Frappé', price: 105 }
					]
				})
			],
			cats
		);
		const coffee = sheet.sections[0];
		expect(coffee.columns).toEqual(['Hot', 'Iced', 'Frappé']);
		expect(coffee.rows[0]).toEqual({ name: 'Americano', prices: [75, 85, null], single: null });
		expect(coffee.rows[1]).toEqual({ name: 'Espresso', prices: [75, 90, 105], single: null });
	});

	it('renders a plain single-price section when no item has base_options', () => {
		const sheet = buildMenuSheet(
			[menu({ id: 1, name: 'Pancake', price: 80, category_id: 20 })],
			cats
		);
		const food = sheet.sections[0];
		expect(food.columns).toEqual([]);
		expect(food.rows[0]).toEqual({ name: 'Pancake', prices: [], single: 80 });
	});

	it('keeps a single price for an item with no variants inside a variant section', () => {
		const sheet = buildMenuSheet(
			[
				menu({
					id: 1,
					name: 'Americano',
					category_id: 10,
					base_options: [{ name: 'Hot', price: 75 }]
				}),
				menu({ id: 2, name: 'Dirty Coffee', price: 110, category_id: 10, base_options: [] })
			],
			cats
		);
		const coffee = sheet.sections[0];
		expect(coffee.columns).toEqual(['Hot']);
		expect(coffee.rows[1]).toEqual({ name: 'Dirty Coffee', prices: [null], single: 110 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/menu-pdf/model.spec.ts`
Expected: FAIL — `buildMenuSheet` cannot be imported / is not a function.

- [ ] **Step 3: Implement `src/lib/menu-pdf/model.ts`**

```ts
import type { Menu } from '$lib/api/menus';
import type { Category } from '$lib/api/categories';

export interface Branding {
	title: string;
	tagline: string;
	subtitle: string;
	hours: string;
	footer: string;
}

export interface SheetRow {
	name: string;
	prices: (number | null)[]; // aligned to SheetSection.columns; [] when columns is empty
	single: number | null; // used when the row has no per-column prices
}

export interface SheetSection {
	title: string;
	columns: string[]; // variant headers, e.g. ['Hot','Iced','Frappé']; [] for a plain list
	rows: SheetRow[];
}

export interface MenuSheet {
	sections: SheetSection[];
}

const OTHER = 'Other';

export function buildMenuSheet(menus: Menu[], categories: Category[]): MenuSheet {
	const active = menus.filter((m) => m.active);

	const byCat = new Map<number | null, Menu[]>();
	for (const m of active) {
		const key = m.category_id ?? null;
		const list = byCat.get(key) ?? [];
		list.push(m);
		byCat.set(key, list);
	}

	const sections: SheetSection[] = [];
	const emit = (key: number | null, title: string) => {
		const items = byCat.get(key);
		if (items && items.length > 0) sections.push(buildSection(title, items));
	};

	for (const c of categories) emit(c.id, c.name);
	emit(null, OTHER); // uncategorised, last

	return { sections };
}

function buildSection(title: string, items: Menu[]): SheetSection {
	const columns: string[] = [];
	const seen = new Set<string>();
	for (const m of items) {
		for (const b of m.base_options) {
			if (!seen.has(b.name)) {
				seen.add(b.name);
				columns.push(b.name);
			}
		}
	}

	const rows: SheetRow[] = items.map((m) => {
		if (columns.length === 0) {
			return { name: m.name, prices: [], single: m.price };
		}
		const priceByName = new Map(m.base_options.map((b) => [b.name, b.price]));
		const prices = columns.map((c) => (priceByName.has(c) ? priceByName.get(c)! : null));
		const single = m.base_options.length === 0 ? m.price : null;
		return { name: m.name, prices, single };
	});

	return { title, columns, rows };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/menu-pdf/model.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/menu-pdf/model.ts src/lib/menu-pdf/model.spec.ts
git commit -m "feat(menu-generator): build print-model transform from menus"
```

---

### Task 3: The pdfmake doc builder + generate glue (`pdf.ts`)

**Files:**
- Create: `src/lib/menu-pdf/pdf.ts`
- Test: `src/lib/menu-pdf/pdf.spec.ts`

**Interfaces:**
- Consumes: `MenuSheet`, `SheetSection`, `Branding` from `./model`; `loadFonts` from `./fonts`.
- Produces:
  - `formatBaht(n: number): string`
  - `splitColumns(sections: SheetSection[]): [SheetSection[], SheetSection[]]`
  - `buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions`
  - `generatePdf(doc: TDocumentDefinitions): Promise<{ dataUrl: string; blob: Blob }>` — consumed by the page in Task 4.

- [ ] **Step 1: Write the failing test `src/lib/menu-pdf/pdf.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { formatBaht, splitColumns, buildDocDefinition } from './pdf';
import type { MenuSheet, SheetSection, Branding } from './model';

const brand: Branding = {
	title: 'TH Gallery & Café',
	tagline: 'Since 2016',
	subtitle: 'Gallery & Café',
	hours: 'Open daily · 8am – 6pm',
	footer: 'All prices in Thai Baht (฿)'
};

function section(title: string, rows: number): SheetSection {
	return {
		title,
		columns: [],
		rows: Array.from({ length: rows }, (_, i) => ({ name: `${title}-${i}`, prices: [], single: 10 }))
	};
}

describe('formatBaht', () => {
	it('drops decimals for whole baht', () => {
		expect(formatBaht(75)).toBe('฿75');
	});
	it('keeps two decimals otherwise', () => {
		expect(formatBaht(75.5)).toBe('฿75.50');
	});
});

describe('splitColumns', () => {
	it('balances sections across two columns by estimated height', () => {
		const [left, right] = splitColumns([section('A', 8), section('B', 1), section('C', 1)]);
		// A alone is tallest; B and C should land opposite it.
		expect(left.map((s) => s.title)).toEqual(['A']);
		expect(right.map((s) => s.title)).toEqual(['B', 'C']);
	});
	it('returns two arrays that together contain every section once', () => {
		const [l, r] = splitColumns([section('A', 2), section('B', 2)]);
		expect([...l, ...r].map((s) => s.title).sort()).toEqual(['A', 'B']);
	});
});

describe('buildDocDefinition', () => {
	const sheet: MenuSheet = { sections: [section('Coffee', 2), section('Food', 2)] };
	const doc = buildDocDefinition(sheet, brand);

	it('is A5 portrait', () => {
		expect(doc.pageSize).toBe('A5');
		expect(doc.pageOrientation).toBe('portrait');
	});
	it('uses the embedded Sarabun font as default', () => {
		expect(doc.defaultStyle?.font).toBe('Sarabun');
	});
	it('lays the body out in two columns', () => {
		const body = doc.content as Array<Record<string, unknown>>;
		const cols = body.find((n) => 'columns' in n) as { columns: unknown[] };
		expect(cols.columns).toHaveLength(2);
	});
	it('includes the branding title somewhere in the header content', () => {
		const body = doc.content as Array<Record<string, unknown>>;
		const texts = body.map((n) => n.text).filter((t) => typeof t === 'string');
		expect(texts).toContain('TH Gallery & Café');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/menu-pdf/pdf.spec.ts`
Expected: FAIL — module `./pdf` / its exports do not exist.

- [ ] **Step 3: Implement `src/lib/menu-pdf/pdf.ts`**

```ts
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Branding, MenuSheet, SheetSection } from './model';

const CREAM = '#f3ead8';
const INK = '#2b2b2b';
// A5 portrait in points (used only for the full-page background rectangle).
const A5_W = 419.53;
const A5_H = 595.28;

export function formatBaht(n: number): string {
	return Number.isInteger(n) ? `฿${n}` : `฿${n.toFixed(2)}`;
}

function estimateHeight(s: SheetSection): number {
	// title (~2 lines of vertical space) + optional column header + one line per row
	return 2 + (s.columns.length ? 1 : 0) + s.rows.length;
}

export function splitColumns(sections: SheetSection[]): [SheetSection[], SheetSection[]] {
	const left: SheetSection[] = [];
	const right: SheetSection[] = [];
	let lh = 0;
	let rh = 0;
	for (const s of sections) {
		const h = estimateHeight(s);
		if (lh <= rh) {
			left.push(s);
			lh += h;
		} else {
			right.push(s);
			rh += h;
		}
	}
	return [left, right];
}

function sectionContent(s: SheetSection): Content {
	const hasCols = s.columns.length > 0;
	const body: TableCell[][] = [];

	if (hasCols) {
		body.push([
			{ text: '' },
			...s.columns.map((c) => ({
				text: c.toUpperCase(),
				fontSize: 6,
				alignment: 'right' as const,
				characterSpacing: 1
			}))
		]);
	}

	for (const r of s.rows) {
		if (!hasCols) {
			body.push([
				{ text: r.name },
				{ text: r.single == null ? '' : formatBaht(r.single), alignment: 'right' }
			]);
			continue;
		}
		const anyPrice = r.prices.some((p) => p != null);
		if (anyPrice) {
			body.push([
				{ text: r.name },
				...r.prices.map((p) => ({
					text: p == null ? '' : formatBaht(p),
					alignment: 'right' as const
				}))
			]);
		} else {
			// item has no variant prices inside a variant section: one price, spanning the price cols
			body.push([
				{ text: r.name },
				{
					text: r.single == null ? '' : formatBaht(r.single),
					alignment: 'right',
					colSpan: s.columns.length
				},
				...Array(Math.max(0, s.columns.length - 1)).fill({ text: '' })
			]);
		}
	}

	const widths = hasCols ? ['*', ...s.columns.map(() => 30)] : ['*', 'auto'];

	return {
		margin: [0, 0, 0, 10],
		stack: [
			{
				text: s.title.toUpperCase(),
				fontSize: 9,
				bold: true,
				characterSpacing: 2,
				alignment: 'center',
				margin: [0, 0, 0, 4]
			},
			{ table: { widths, body }, layout: 'noBorders' }
		]
	};
}

export function buildDocDefinition(sheet: MenuSheet, b: Branding): TDocumentDefinitions {
	const [left, right] = splitColumns(sheet.sections);
	return {
		pageSize: 'A5',
		pageOrientation: 'portrait',
		pageMargins: [28, 28, 28, 34],
		defaultStyle: { font: 'Sarabun', fontSize: 8, color: INK },
		background: () => ({
			canvas: [{ type: 'rect', x: 0, y: 0, w: A5_W, h: A5_H, color: CREAM }]
		}),
		content: [
			{
				text: b.tagline.toUpperCase(),
				alignment: 'center',
				fontSize: 7,
				characterSpacing: 3,
				margin: [0, 0, 0, 2]
			},
			{ text: b.title, alignment: 'center', fontSize: 20, bold: true },
			{ text: b.subtitle, alignment: 'center', fontSize: 10, margin: [0, 2, 0, 14] },
			{
				columns: [
					{ width: '*', stack: left.map(sectionContent) },
					{ width: '*', stack: right.map(sectionContent) }
				],
				columnGap: 18
			}
		],
		footer: () => ({
			text: `${b.hours}      ${b.footer}`,
			alignment: 'center',
			fontSize: 7,
			italics: true,
			color: INK,
			margin: [0, 10, 0, 0]
		})
	};
}

export async function generatePdf(
	doc: TDocumentDefinitions
): Promise<{ dataUrl: string; blob: Blob }> {
	const [pdfMod, { loadFonts }] = await Promise.all([
		import('pdfmake/build/pdfmake'),
		import('./fonts')
	]);
	// pdfmake's browser build is CJS; the module or its .default is the pdfMake object.
	const pdfMake = (pdfMod as unknown as { default?: unknown }).default ?? pdfMod;
	const mk = pdfMake as {
		vfs: Record<string, string>;
		fonts: unknown;
		createPdf: (d: TDocumentDefinitions) => {
			getBlob: (cb: (b: Blob) => void) => void;
			getDataUrl: (cb: (u: string) => void) => void;
		};
	};
	const { vfs, fonts } = await loadFonts();
	mk.vfs = vfs;
	mk.fonts = fonts;
	const pdf = mk.createPdf(doc);
	const blob = await new Promise<Blob>((res) => pdf.getBlob(res));
	const dataUrl = await new Promise<string>((res) => pdf.getDataUrl(res));
	return { dataUrl, blob };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/menu-pdf/pdf.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/menu-pdf/pdf.ts src/lib/menu-pdf/pdf.spec.ts
git commit -m "feat(menu-generator): build A5 pdfmake document from print model"
```

---

### Task 4: The Menu Generator page

**Files:**
- Create: `src/routes/(app)/menu-generator/+page.svelte`

**Interfaces:**
- Consumes: `listMenus`/`Menu` (`$lib/api/menus`), `listCategories`/`Category` (`$lib/api/categories`), `getSettings` (`$lib/api/settings`), `buildMenuSheet`/`Branding` (`$lib/menu-pdf/model`), `buildDocDefinition`/`generatePdf` (`$lib/menu-pdf/pdf`), iOS components.

- [ ] **Step 1: Create `src/routes/(app)/menu-generator/+page.svelte`**

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listMenus, type Menu } from '$lib/api/menus';
	import { listCategories, type Category } from '$lib/api/categories';
	import { getSettings } from '$lib/api/settings';
	import { buildMenuSheet, type Branding } from '$lib/menu-pdf/model';
	import { buildDocDefinition, generatePdf } from '$lib/menu-pdf/pdf';

	let loading = $state(true);
	let err = $state('');
	let menus = $state<Menu[]>([]);
	let categories = $state<Category[]>([]);

	let brand = $state<Branding>({
		title: '',
		tagline: 'Since 2016',
		subtitle: '',
		hours: 'Open daily · 8am – 6pm',
		footer: 'All prices in Thai Baht (฿)'
	});

	let previewUrl = $state('');
	let generating = $state(false);
	let blob = $state<Blob | null>(null);

	onMount(async () => {
		try {
			const [m, c, s] = await Promise.all([listMenus(), listCategories(), getSettings()]);
			menus = m;
			categories = c;
			brand.title = s.shop_name || 'Menu';
		} catch (e) {
			err = (e as Error).message;
		} finally {
			loading = false;
		}
	});

	const sheet = $derived(buildMenuSheet(menus, categories));
	const hasItems = $derived(sheet.sections.length > 0);

	// Regenerate the preview (debounced) whenever the data or branding changes.
	$effect(() => {
		const doc = buildDocDefinition(sheet, { ...brand });
		if (!hasItems) return;
		generating = true;
		const timer = setTimeout(async () => {
			try {
				const out = await generatePdf(doc);
				previewUrl = out.dataUrl;
				blob = out.blob;
			} catch (e) {
				showToast((e as Error).message, 'error');
			} finally {
				generating = false;
			}
		}, 400);
		return () => clearTimeout(timer);
	});

	function download() {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'menu.pdf';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<NavBar title="Menu Generator" />

<div class="space-y-6 px-4 pt-2 pb-6">
	{#if loading}
		<div class="flex justify-center py-16"><Spinner /></div>
	{:else if err}
		<EmptyState title="Couldn’t load menus" subtitle={err} />
	{:else if !hasItems}
		<EmptyState title="No active menu items" subtitle="Add active items to generate a menu." />
	{:else}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Branding</p>
			<Card>
				<div class="space-y-4">
					<TextField label="Title" bind:value={brand.title} placeholder="TH Gallery & Café" />
					<TextField label="Tagline" bind:value={brand.tagline} placeholder="Since 2016" />
					<TextField label="Subtitle" bind:value={brand.subtitle} placeholder="Gallery & Café" />
					<TextField label="Hours" bind:value={brand.hours} placeholder="Open daily · 8am – 6pm" />
					<TextField label="Footer note" bind:value={brand.footer} placeholder="All prices in Thai Baht (฿)" />
				</div>
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Preview</p>
			<Card padded={false}>
				<div class="relative">
					{#if previewUrl}
						<iframe title="Menu preview" src={previewUrl} class="h-[70vh] w-full rounded-xl"></iframe>
					{:else}
						<div class="flex h-[70vh] items-center justify-center"><Spinner /></div>
					{/if}
					{#if generating && previewUrl}
						<div class="absolute right-3 top-3"><Spinner /></div>
					{/if}
				</div>
			</Card>
		</div>

		<Button onclick={download} disabled={!blob || generating}>
			{generating ? 'Generating…' : 'Download PDF'}
		</Button>
	{/if}
</div>
```

- [ ] **Step 2: Type-check the page**

Run: `npm run check`
Expected: PASS (0 errors).

- [ ] **Step 3: Manual smoke test against the live backend**

Run: `BACKEND_URL=http://100.109.90.83:8085 npm run dev`, log in, open `/menu-generator`.
Verify: branding form prefills Title from shop name; preview renders an A5 menu with category sections and prices; **Download PDF** saves `menu.pdf`; a menu item with Thai characters renders correctly (Sarabun).

- [ ] **Step 4: Commit**

```bash
git add src/routes/'(app)'/menu-generator/+page.svelte
git commit -m "feat(menu-generator): add generator page with preview and download"
```

---

### Task 5: Link from More → Catalog + full verification

**Files:**
- Modify: `src/routes/(app)/more/+page.svelte` (the `Catalog` group's `items` array)

- [ ] **Step 1: Add the Menu Generator list row**

In `src/routes/(app)/more/+page.svelte`, add to the `Catalog` group's `items` array (after the `Discounts` entry):

```ts
{ href: '/menu-generator', label: 'Menu Generator', icon: '🖨️' }
```

Resulting `Catalog` group:

```ts
{
	title: 'Catalog',
	items: [
		{ href: '/orders', label: 'Orders', icon: '🧾' },
		{ href: '/option-groups', label: 'Option Groups', icon: '⌥' },
		{ href: '/discounts', label: 'Discounts', icon: '％' },
		{ href: '/menu-generator', label: 'Menu Generator', icon: '🖨️' }
	]
},
```

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test:unit -- --run`
Expected: PASS — includes the new `model.spec.ts` (6) and `pdf.spec.ts` (8) alongside existing specs.

- [ ] **Step 3: Type-check and lint**

Run: `npm run check && npm run lint`
Expected: PASS (0 errors; prettier/eslint clean).

- [ ] **Step 4: Commit**

```bash
git add src/routes/'(app)'/more/+page.svelte
git commit -m "feat(menu-generator): link from More → Catalog"
```

---

## Notes for the executor

- The two `.spec.ts` files run in vitest's **server (node)** project — they import only types from the API clients, so no `fetch` runs at import time.
- `generatePdf` is intentionally **not** unit-tested (it depends on the browser: `fetch` for fonts, `btoa`, pdfmake DOM/canvas). It's exercised by the Task 4 manual smoke test.
- When implementing the Svelte page, run the `svelte-autofixer` MCP tool on `+page.svelte` before finalizing, and resolve any reported issues (project convention).
- No changes to `src/routes/api/[...path]/+server.ts` (`ALLOW`) or the Go backend are required.
```
