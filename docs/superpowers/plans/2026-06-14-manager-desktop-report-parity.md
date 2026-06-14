# Desktop Layout + Report Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SvelteKit manager usable on desktop (iPad-style sidebar) and bring the dashboard to full function parity with the Go `/manager` report, using Chart.js — keeping the iOS look.

**Architecture:** Pure utility modules (range/delta/format) + typed API loader, isolated chart components (Chart.js line + doughnut, client-only; CSS-grid heatmap + row waterfall), an assembled report page, and a responsive app shell (`SideNav` on `md+`, `BottomTabBar` on mobile). Frontend-only; all backend endpoints already exist.

**Tech Stack:** SvelteKit, Svelte 5 runes, Tailwind v4, Chart.js, Vitest (node + vitest-browser-svelte/playwright).

**Spec:** `docs/superpowers/specs/2026-06-14-manager-desktop-report-parity-design.md`

**Conventions (verified):**

- Run one test file: `npm run test:unit -- --run <path>` · all: `npm run test:unit -- --run`
- Types: `npm run check` · Lint/format: `npm run lint` / `npm run format`
- Node specs `*.spec.ts` (server project); component specs `*.svelte.spec.ts` (chromium browser project). `requireAssertions` is on — every test must assert.
- Component test idiom: `import { page } from 'vitest/browser'; import { render } from 'vitest-browser-svelte';`

---

## File Structure

| File                                                                | Responsibility                             |
| ------------------------------------------------------------------- | ------------------------------------------ |
| `src/lib/format.ts` (+ `.spec.ts`)                                  | `baht(n)` THB formatter                    |
| `src/lib/dashboard/types.ts`                                        | Shared API response types                  |
| `src/lib/dashboard/range.ts` (+ `.spec.ts`)                         | Preset → `{from,to}` ISO range             |
| `src/lib/dashboard/delta.ts` (+ `.spec.ts`)                         | `deltaPct` + `deltaLabel`                  |
| `src/lib/dashboard/api.ts`                                          | Typed fetchers + `loadDashboard(range)`    |
| `src/lib/charts/chartTheme.ts`                                      | Chart.js controller registration + palette |
| `src/lib/charts/donutData.ts` (+ `.spec.ts`)                        | `topNWithOther` reducer                    |
| `src/lib/components/charts/Waterfall.svelte` (+ `.svelte.spec.ts`)  | Sales-breakdown rows                       |
| `src/lib/components/charts/Heatmap.svelte` (+ `.svelte.spec.ts`)    | 7×24 CSS grid                              |
| `src/lib/components/charts/SalesChart.svelte` (+ `.svelte.spec.ts`) | Chart.js line                              |
| `src/lib/components/charts/Donut.svelte` (+ `.svelte.spec.ts`)      | Chart.js doughnut                          |
| `src/lib/components/ios/SideNav.svelte`                             | Desktop sidebar                            |
| `src/routes/(app)/+layout.svelte` _(modify)_                        | Responsive shell                           |
| `src/routes/(app)/+page.svelte` _(modify)_                          | Assembled report page                      |
| `package.json` _(modify)_                                           | Add `chart.js`                             |

---

## Task 1: Install Chart.js + `baht` formatter

**Files:** Create `src/lib/format.ts`, `src/lib/format.spec.ts`; Modify `package.json`.

- [ ] **Step 1: Install Chart.js**

Run: `npm install chart.js`
Expected: `package.json` `dependencies` gains `chart.js`; lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `src/lib/format.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { baht } from './format';

describe('baht', () => {
	it('formats THB with symbol and 2 decimals', () => {
		expect(baht(1518)).toBe('฿1,518.00');
	});
	it('treats 0 and NaN as ฿0.00', () => {
		expect(baht(0)).toBe('฿0.00');
		expect(baht(Number.NaN)).toBe('฿0.00');
	});
});
```

- [ ] **Step 3: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/format.spec.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 4: Implement**

Create `src/lib/format.ts`:

```ts
export function baht(n: number): string {
	return (
		'฿' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
	);
}
```

- [ ] **Step 5: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/format.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/format.ts src/lib/format.spec.ts
git commit -m "feat(manager): add chart.js dep + baht formatter"
```

---

## Task 2: Preset → range utility

**Files:** Create `src/lib/dashboard/range.ts`, `src/lib/dashboard/range.spec.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboard/range.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { presetRange } from './range';

describe('presetRange', () => {
	const today = new Date(2026, 5, 14); // local 2026-06-14 (month is 0-indexed)

	it('today = single inclusive day', () => {
		expect(presetRange('today', today)).toEqual({ from: '2026-06-14', to: '2026-06-14' });
	});
	it('7d = 7 inclusive days', () => {
		expect(presetRange('7d', today)).toEqual({ from: '2026-06-08', to: '2026-06-14' });
	});
	it('30d = 30 inclusive days', () => {
		expect(presetRange('30d', today)).toEqual({ from: '2026-05-16', to: '2026-06-14' });
	});
	it('90d = 90 inclusive days', () => {
		expect(presetRange('90d', today)).toEqual({ from: '2026-03-17', to: '2026-06-14' });
	});
});
```

- [ ] **Step 2: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/dashboard/range.spec.ts`
Expected: FAIL — cannot resolve `./range`.

- [ ] **Step 3: Implement**

Create `src/lib/dashboard/range.ts`:

```ts
export type Preset = 'today' | '7d' | '30d' | '90d';
export interface Range {
	from: string; // inclusive ISO yyyy-mm-dd (shop-local)
	to: string; // inclusive ISO yyyy-mm-dd
}

const PRESET_DAYS: Record<Preset, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };

function isoDay(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function presetRange(preset: Preset, today: Date): Range {
	const to = isoDay(today);
	const from = new Date(today);
	from.setDate(from.getDate() - PRESET_DAYS[preset]);
	return { from: isoDay(from), to };
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/dashboard/range.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/range.ts src/lib/dashboard/range.spec.ts
git commit -m "feat(manager): date preset -> range util"
```

---

## Task 3: KPI delta utility

**Files:** Create `src/lib/dashboard/delta.ts`, `src/lib/dashboard/delta.spec.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/dashboard/delta.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deltaPct, deltaLabel } from './delta';

describe('deltaPct', () => {
	it('computes percent change', () => {
		expect(deltaPct(150, 100)).toBe(50);
	});
	it('returns null when previous is 0', () => {
		expect(deltaPct(150, 0)).toBeNull();
	});
});

describe('deltaLabel', () => {
	it('formats an increase', () => {
		expect(deltaLabel(50)).toBe('▲ 50%');
	});
	it('formats a decrease', () => {
		expect(deltaLabel(-25)).toBe('▼ 25%');
	});
	it('says "no prior" for null', () => {
		expect(deltaLabel(null)).toBe('no prior');
	});
});
```

- [ ] **Step 2: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/dashboard/delta.spec.ts`
Expected: FAIL — cannot resolve `./delta`.

- [ ] **Step 3: Implement**

Create `src/lib/dashboard/delta.ts`:

```ts
export function deltaPct(curr: number, prev: number): number | null {
	if (!prev) return null;
	return ((curr - prev) / prev) * 100;
}

export function deltaLabel(pct: number | null): string {
	if (pct === null || !Number.isFinite(pct)) return 'no prior';
	const arrow = pct >= 0 ? '▲' : '▼';
	return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/dashboard/delta.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/delta.ts src/lib/dashboard/delta.spec.ts
git commit -m "feat(manager): KPI delta util"
```

---

## Task 4: API types + dashboard loader

**Files:** Create `src/lib/dashboard/types.ts`, `src/lib/dashboard/api.ts`.

(No unit test: this is network glue verified by `npm run check` and the page smoke. Types mirror the Go service JSON field names exactly.)

- [ ] **Step 1: Create types**

Create `src/lib/dashboard/types.ts`:

```ts
export interface PeriodStats {
	revenue: number;
	gross: number;
	discount: number;
	subsidy: number;
	net_sales: number;
	customers_paid: number;
	orders: number;
	items: number;
	avg_ticket: number;
	items_per_order: number;
}
export interface CompareResult {
	current: PeriodStats;
	previous: PeriodStats;
}
export interface DayPoint {
	day: string;
	revenue: number;
	orders: number;
	items: number;
}
export interface HeatmapCell {
	dow: number;
	hour: number;
	revenue: number;
	orders: number;
}
export interface TopMenu {
	name: string;
	qty_sold: number;
	revenue: number;
}
export interface SubsidyProgram {
	name: string;
	amount: number;
}
```

- [ ] **Step 2: Create loader**

Create `src/lib/dashboard/api.ts`:

```ts
import type { Range } from './range';
import type { CompareResult, DayPoint, HeatmapCell, TopMenu, SubsidyProgram } from './types';

async function get<T>(path: string): Promise<T> {
	const res = await fetch(path);
	if (!res.ok) throw new Error(`${path} -> ${res.status}`);
	const body = await res.json();
	return body.data as T;
}

export interface DashboardData {
	compare: CompareResult;
	salesByDay: DayPoint[];
	heatmap: HeatmapCell[];
	topMenus: TopMenu[];
	subsidies: SubsidyProgram[];
}

export async function loadDashboard(range: Range): Promise<DashboardData> {
	const qs = `from=${range.from}&to=${range.to}`;
	const [compare, salesByDay, heatmap, topMenus, subsidies] = await Promise.all([
		get<CompareResult>(`/api/dashboard/compare?${qs}`),
		get<DayPoint[]>(`/api/dashboard/sales-by-day?${qs}`),
		get<HeatmapCell[]>(`/api/dashboard/heatmap?${qs}`),
		get<TopMenu[]>(`/api/dashboard/top-menus?${qs}`),
		get<SubsidyProgram[]>(`/api/dashboard/subsidies?${qs}`)
	]);
	return { compare, salesByDay, heatmap, topMenus, subsidies };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no new errors in `src/lib/dashboard/*`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboard/types.ts src/lib/dashboard/api.ts
git commit -m "feat(manager): dashboard API types + loader"
```

---

## Task 5: `topNWithOther` reducer + chart theme

**Files:** Create `src/lib/charts/donutData.ts`, `src/lib/charts/donutData.spec.ts`, `src/lib/charts/chartTheme.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/charts/donutData.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { topNWithOther } from './donutData';

const items = [
	{ name: 'A', qty_sold: 1, revenue: 100 },
	{ name: 'B', qty_sold: 1, revenue: 80 },
	{ name: 'C', qty_sold: 1, revenue: 50 },
	{ name: 'D', qty_sold: 1, revenue: 20 }
];

describe('topNWithOther', () => {
	it('keeps top n and buckets the rest as Other', () => {
		expect(topNWithOther(items, 2)).toEqual([
			{ name: 'A', revenue: 100 },
			{ name: 'B', revenue: 80 },
			{ name: 'Other', revenue: 70 }
		]);
	});
	it('omits Other when everything fits', () => {
		expect(topNWithOther(items, 10)).toHaveLength(4);
	});
});
```

- [ ] **Step 2: Run it — verify fail**

Run: `npm run test:unit -- --run src/lib/charts/donutData.spec.ts`
Expected: FAIL — cannot resolve `./donutData`.

- [ ] **Step 3: Implement reducer**

Create `src/lib/charts/donutData.ts`:

```ts
import type { TopMenu } from '$lib/dashboard/types';

export interface Slice {
	name: string;
	revenue: number;
}

export function topNWithOther(items: TopMenu[], n: number): Slice[] {
	const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
	const head: Slice[] = sorted.slice(0, n).map((m) => ({ name: m.name, revenue: m.revenue }));
	const rest = sorted.slice(n);
	if (rest.length) {
		head.push({ name: 'Other', revenue: rest.reduce((s, m) => s + m.revenue, 0) });
	}
	return head;
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/charts/donutData.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement chart theme (no test — registration glue)**

Create `src/lib/charts/chartTheme.ts`:

```ts
import {
	Chart,
	LineController,
	LineElement,
	PointElement,
	LinearScale,
	CategoryScale,
	DoughnutController,
	ArcElement,
	Tooltip,
	Filler
} from 'chart.js';

let registered = false;

/** Register only the controllers we use; safe to call repeatedly. */
export function ensureChart(): typeof Chart {
	if (!registered) {
		Chart.register(
			LineController,
			LineElement,
			PointElement,
			LinearScale,
			CategoryScale,
			DoughnutController,
			ArcElement,
			Tooltip,
			Filler
		);
		registered = true;
	}
	return Chart;
}

export const PALETTE = [
	'#0a84ff',
	'#30d158',
	'#ff9f0a',
	'#ff375f',
	'#bf5af2',
	'#64d2ff',
	'#ffd60a'
];
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/charts/
git commit -m "feat(manager): donut data reducer + chart.js theme"
```

---

## Task 6: Waterfall component

**Files:** Create `src/lib/components/charts/Waterfall.svelte`, `src/lib/components/charts/Waterfall.svelte.spec.ts`.

- [ ] **Step 1: Implement component**

Create `src/lib/components/charts/Waterfall.svelte`:

```svelte
<script lang="ts">
	import Card from '$lib/components/ios/Card.svelte';
	import { baht } from '$lib/format';
	let {
		gross,
		discount,
		net,
		subsidy
	}: { gross: number; discount: number; net: number; subsidy: number } = $props();
</script>

<Card>
	<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Sales breakdown</p>
	<div class="space-y-1 text-sm">
		<div class="flex justify-between">
			<span class="text-[var(--ios-label-secondary)]">Gross sales</span>
			<span class="font-mono text-[var(--ios-label)]" data-testid="wf-gross">{baht(gross)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-[var(--ios-label-secondary)]">− Discounts</span>
			<span class="font-mono text-[var(--ios-label)]">{baht(discount)}</span>
		</div>
		<div class="flex justify-between border-t border-[var(--ios-separator)] pt-1 font-semibold">
			<span>= Net sales</span>
			<span class="font-mono" data-testid="wf-net">{baht(net)}</span>
		</div>
		{#if subsidy > 0}
			<div class="flex justify-between">
				<span class="text-[var(--ios-label-secondary)]">+ Subsidy</span>
				<span class="font-mono text-[var(--ios-label)]">{baht(subsidy)}</span>
			</div>
		{/if}
	</div>
</Card>
```

- [ ] **Step 2: Write the test**

Create `src/lib/components/charts/Waterfall.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Waterfall from './Waterfall.svelte';

describe('Waterfall.svelte', () => {
	it('shows gross and net values', async () => {
		render(Waterfall, { gross: 1518, discount: 0, net: 1518, subsidy: 0 });
		await expect.element(page.getByTestId('wf-gross')).toHaveTextContent('฿1,518.00');
		await expect.element(page.getByTestId('wf-net')).toHaveTextContent('฿1,518.00');
	});
	it('hides the subsidy row when zero', async () => {
		render(Waterfall, { gross: 100, discount: 0, net: 100, subsidy: 0 });
		await expect.element(page.getByText('+ Subsidy')).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/components/charts/Waterfall.svelte.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/charts/Waterfall.svelte src/lib/components/charts/Waterfall.svelte.spec.ts
git commit -m "feat(manager): sales-breakdown waterfall component"
```

---

## Task 7: Heatmap component

**Files:** Create `src/lib/components/charts/Heatmap.svelte`, `src/lib/components/charts/Heatmap.svelte.spec.ts`.

- [ ] **Step 1: Implement component**

Create `src/lib/components/charts/Heatmap.svelte`:

```svelte
<script lang="ts">
	import Card from '$lib/components/ios/Card.svelte';
	import type { HeatmapCell } from '$lib/dashboard/types';

	let { cells }: { cells: HeatmapCell[] } = $props();
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const hours = Array.from({ length: 24 }, (_, h) => h);
	const max = $derived(Math.max(1, ...cells.map((c) => c.revenue)));

	function rev(dow: number, hour: number): number {
		return cells.find((c) => c.dow === dow && c.hour === hour)?.revenue ?? 0;
	}
</script>

<Card>
	<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Busy times</p>
	<div class="overflow-x-auto">
		<div class="grid gap-0.5" style="grid-template-columns: 30px repeat(24, 1fr); min-width: 520px">
			<div></div>
			{#each hours as h (h)}
				<div class="text-center text-[8px] text-[var(--ios-label-tertiary)]">
					{h % 6 === 0 ? h : ''}
				</div>
			{/each}
			{#each days as label, dow (dow)}
				<div class="text-[9px] leading-4 text-[var(--ios-label-secondary)]">{label}</div>
				{#each hours as h (h)}
					{@const v = rev(dow, h)}
					<div
						class="aspect-square rounded-[2px]"
						style="background-color: color-mix(in srgb, var(--ios-blue) {Math.round(
							(v / max) * 100
						)}%, transparent)"
						data-testid="cell-{dow}-{h}"
						title="{label} {h}:00 · {v}"
					></div>
				{/each}
			{/each}
		</div>
	</div>
</Card>
```

- [ ] **Step 2: Write the test**

Create `src/lib/components/charts/Heatmap.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Heatmap from './Heatmap.svelte';

describe('Heatmap.svelte', () => {
	it('renders cells across the 7x24 grid', async () => {
		render(Heatmap, { cells: [{ dow: 1, hour: 9, revenue: 500, orders: 5 }] });
		await expect.element(page.getByTestId('cell-1-9')).toBeInTheDocument();
		await expect.element(page.getByTestId('cell-6-23')).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/components/charts/Heatmap.svelte.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/charts/Heatmap.svelte src/lib/components/charts/Heatmap.svelte.spec.ts
git commit -m "feat(manager): day x hour heatmap component"
```

---

## Task 8: SalesChart (Chart.js line)

**Files:** Create `src/lib/components/charts/SalesChart.svelte`, `src/lib/components/charts/SalesChart.svelte.spec.ts`.

- [ ] **Step 1: Implement component**

Create `src/lib/components/charts/SalesChart.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Chart } from 'chart.js';
	import { ensureChart, PALETTE } from '$lib/charts/chartTheme';
	import type { DayPoint } from '$lib/dashboard/types';

	let { points }: { points: DayPoint[] } = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: Chart | undefined;

	function chartData() {
		return {
			labels: points.map((p) => p.day.slice(5)),
			datasets: [
				{
					label: 'Revenue',
					data: points.map((p) => p.revenue),
					borderColor: PALETTE[0],
					backgroundColor: 'rgba(10,132,255,0.12)',
					fill: true,
					tension: 0.3,
					pointRadius: 2
				}
			]
		};
	}

	onMount(() => {
		const C = ensureChart();
		chart = new C(canvas!, {
			type: 'line',
			data: chartData(),
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: { y: { beginAtZero: true } }
			}
		});
	});

	$effect(() => {
		if (chart) {
			chart.data = chartData();
			chart.update();
		}
	});

	onDestroy(() => chart?.destroy());
</script>

<div class="h-48" data-testid="sales-chart"><canvas bind:this={canvas}></canvas></div>
```

- [ ] **Step 2: Write the smoke test**

Create `src/lib/components/charts/SalesChart.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SalesChart from './SalesChart.svelte';

describe('SalesChart.svelte', () => {
	it('mounts with data without throwing', async () => {
		render(SalesChart, {
			points: [
				{ day: '2026-06-13', revenue: 430, orders: 5, items: 5 },
				{ day: '2026-06-14', revenue: 1518, orders: 15, items: 20 }
			]
		});
		await expect.element(page.getByTestId('sales-chart')).toBeInTheDocument();
	});
	it('mounts with empty data without throwing', async () => {
		render(SalesChart, { points: [] });
		await expect.element(page.getByTestId('sales-chart')).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/components/charts/SalesChart.svelte.spec.ts`
Expected: PASS (2 tests). If Chart.js threw during mount, the effect/mount error would surface and the test fails — that is the smoke signal.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/charts/SalesChart.svelte src/lib/components/charts/SalesChart.svelte.spec.ts
git commit -m "feat(manager): chart.js sales-by-day line chart"
```

---

## Task 9: Donut (Chart.js doughnut)

**Files:** Create `src/lib/components/charts/Donut.svelte`, `src/lib/components/charts/Donut.svelte.spec.ts`.

- [ ] **Step 1: Implement component**

Create `src/lib/components/charts/Donut.svelte`:

```svelte
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Chart } from 'chart.js';
	import { ensureChart, PALETTE } from '$lib/charts/chartTheme';
	import { topNWithOther } from '$lib/charts/donutData';
	import type { TopMenu } from '$lib/dashboard/types';

	let { items }: { items: TopMenu[] } = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: Chart | undefined;

	function chartData() {
		const slices = topNWithOther(items, 6);
		return {
			labels: slices.map((s) => s.name),
			datasets: [{ data: slices.map((s) => s.revenue), backgroundColor: PALETTE, borderWidth: 0 }]
		};
	}

	onMount(() => {
		const C = ensureChart();
		chart = new C(canvas!, {
			type: 'doughnut',
			data: chartData(),
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { position: 'bottom' } }
			}
		});
	});

	$effect(() => {
		if (chart) {
			chart.data = chartData();
			chart.update();
		}
	});

	onDestroy(() => chart?.destroy());
</script>

<div class="h-56" data-testid="donut-chart"><canvas bind:this={canvas}></canvas></div>
```

- [ ] **Step 2: Write the smoke test**

Create `src/lib/components/charts/Donut.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Donut from './Donut.svelte';

describe('Donut.svelte', () => {
	it('mounts with data without throwing', async () => {
		render(Donut, {
			items: [
				{ name: 'Latte', qty_sold: 10, revenue: 1000 },
				{ name: 'Mocha', qty_sold: 5, revenue: 500 }
			]
		});
		await expect.element(page.getByTestId('donut-chart')).toBeInTheDocument();
	});
	it('mounts with empty data without throwing', async () => {
		render(Donut, { items: [] });
		await expect.element(page.getByTestId('donut-chart')).toBeInTheDocument();
	});
});
```

- [ ] **Step 3: Run it — verify pass**

Run: `npm run test:unit -- --run src/lib/components/charts/Donut.svelte.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/charts/Donut.svelte src/lib/components/charts/Donut.svelte.spec.ts
git commit -m "feat(manager): chart.js top-items donut"
```

---

## Task 10: Rebuild the report page

**Files:** Modify `src/routes/(app)/+page.svelte` (full replacement).

(No unit test — assembly; verified by `npm run check` + manual viewport check in Task 12.)

- [ ] **Step 1: Replace the page**

Replace the entire contents of `src/routes/(app)/+page.svelte` with:

```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import Waterfall from '$lib/components/charts/Waterfall.svelte';
	import Heatmap from '$lib/components/charts/Heatmap.svelte';
	import SalesChart from '$lib/components/charts/SalesChart.svelte';
	import Donut from '$lib/components/charts/Donut.svelte';
	import { baht } from '$lib/format';
	import { presetRange, type Preset } from '$lib/dashboard/range';
	import { deltaPct, deltaLabel } from '$lib/dashboard/delta';
	import { loadDashboard, type DashboardData } from '$lib/dashboard/api';

	const presets = [
		{ label: 'Today', value: 'today' },
		{ label: '7D', value: '7d' },
		{ label: '30D', value: '30d' },
		{ label: '90D', value: '90d' }
	];

	let preset = $state('7d');
	let data = $state<DashboardData | null>(null);
	let loading = $state(true);
	let errored = $state(false);

	async function load(p: string) {
		loading = true;
		errored = false;
		try {
			data = await loadDashboard(presetRange(p as Preset, new Date()));
		} catch {
			errored = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load(preset);
	});

	const cur = $derived(data?.compare.current);
	const prev = $derived(data?.compare.previous);
</script>

<NavBar title="Dashboard" />

<div class="space-y-4 px-4 pt-2 pb-6">
	<SegmentedControl options={presets} bind:value={preset} />

	{#if loading && !data}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn’t load data" subtitle="Try again later." />
	{:else if data && cur && prev}
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [{ label: 'Net sales', val: baht(cur.net_sales), d: deltaPct(cur.net_sales, prev.net_sales) }, { label: 'Orders', val: String(cur.orders), d: deltaPct(cur.orders, prev.orders) }, { label: 'Items', val: String(cur.items), d: deltaPct(cur.items, prev.items) }, { label: 'Avg ticket', val: baht(cur.avg_ticket), d: deltaPct(cur.avg_ticket, prev.avg_ticket) }] as kpi (kpi.label)}
				<Card>
					<p class="text-sm text-[var(--ios-label-secondary)]">{kpi.label}</p>
					<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{kpi.val}</p>
					<p class="mt-0.5 text-xs text-[var(--ios-label-tertiary)]">{deltaLabel(kpi.d)}</p>
				</Card>
			{/each}
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Waterfall
				gross={cur.gross}
				discount={cur.discount}
				net={cur.net_sales}
				subsidy={cur.subsidy}
			/>
			<Card>
				<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Sales over time</p>
				{#if data.salesByDay.length === 0}
					<p class="text-[var(--ios-label-secondary)]">No sales in this period.</p>
				{:else}
					<SalesChart points={data.salesByDay} />
				{/if}
			</Card>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Card>
				<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Item mix</p>
				{#if data.topMenus.length === 0}
					<p class="text-[var(--ios-label-secondary)]">No sales yet.</p>
				{:else}
					<Donut items={data.topMenus} />
				{/if}
			</Card>
			<Heatmap cells={data.heatmap} />
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Top items</p>
			{#if data.topMenus.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No sales yet.</p></Card>
			{:else}
				<Card padded={false}>
					{#each data.topMenus as m, i (m.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < data.topMenus.length - 1
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

		{#if data.subsidies.length > 0}
			<div>
				<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">
					Subsidy by program
				</p>
				<Card padded={false}>
					{#each data.subsidies as s, i (s.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < data.subsidies.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{s.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{baht(s.amount)}</span>
						</div>
					{/each}
				</Card>
			</div>
		{/if}
	{/if}
</div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run check`
Expected: no errors in `+page.svelte`.

- [ ] **Step 3: Commit**

```bash
git add 'src/routes/(app)/+page.svelte'
git commit -m "feat(manager): full report page (KPIs, charts, heatmap, waterfall, presets)"
```

---

## Task 11: Desktop sidebar + responsive shell

**Files:** Create `src/lib/components/ios/SideNav.svelte`; Modify `src/routes/(app)/+layout.svelte`.

- [ ] **Step 1: Create SideNav**

Create `src/lib/components/ios/SideNav.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';

	const groups = [
		{
			title: '',
			items: [
				{ href: '/', label: 'Dashboard', icon: '📊' },
				{ href: '/menu', label: 'Menu', icon: '☕' },
				{ href: '/members', label: 'Members', icon: '👤' }
			]
		},
		{
			title: 'Catalog',
			items: [
				{ href: '/option-groups', label: 'Option Groups', icon: '⌥' },
				{ href: '/discounts', label: 'Discounts', icon: '％' }
			]
		},
		{
			title: 'Staff & Shop',
			items: [
				{ href: '/cashiers', label: 'Cashiers', icon: '⛁' },
				{ href: '/drawer', label: 'Cash Drawer', icon: '💵' },
				{ href: '/settings', label: 'Settings', icon: '⚙' }
			]
		}
	];
</script>

<nav
	class="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--ios-separator)] bg-[var(--ios-nav-blur)] px-3 py-5 backdrop-blur-xl md:flex"
	style="-webkit-backdrop-filter: blur(20px)"
>
	<p class="px-2 text-lg font-bold text-[var(--ios-label)]">Manager</p>
	{#each groups as group (group.title)}
		<div class="flex flex-col gap-0.5">
			{#if group.title}
				<p
					class="mb-1 px-2 text-xs font-medium tracking-wide text-[var(--ios-label-tertiary)] uppercase"
				>
					{group.title}
				</p>
			{/if}
			{#each group.items as item (item.href)}
				{@const active = page.url.pathname === item.href}
				<a
					href={item.href}
					class="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium {active
						? 'bg-[var(--ios-fill)] text-[var(--ios-blue)]'
						: 'text-[var(--ios-label)]'}"
				>
					<span class="text-lg">{item.icon}</span>{item.label}
				</a>
			{/each}
		</div>
	{/each}
</nav>
```

- [ ] **Step 2: Make the shell responsive**

Replace the contents of `src/routes/(app)/+layout.svelte` with:

```svelte
<script lang="ts">
	import BottomTabBar from '$lib/components/ios/BottomTabBar.svelte';
	import SideNav from '$lib/components/ios/SideNav.svelte';
	import ToastHost from '$lib/components/ios/ToastHost.svelte';
	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/menu', label: 'Menu', icon: '☕' },
		{ href: '/members', label: 'Members', icon: '👤' },
		{ href: '/more', label: 'More', icon: '⋯' }
	];
</script>

<div class="flex min-h-screen bg-[var(--ios-grouped-bg)]">
	<SideNav />
	<div class="flex min-h-screen min-w-0 flex-1 flex-col">
		<main class="flex-1 md:mx-auto md:w-full md:max-w-5xl md:px-6">{@render children?.()}</main>
		<div class="md:hidden"><BottomTabBar {tabs} /></div>
	</div>
</div>
<ToastHost />
```

- [ ] **Step 3: Typecheck**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add 'src/lib/components/ios/SideNav.svelte' 'src/routes/(app)/+layout.svelte'
git commit -m "feat(manager): desktop sidebar + responsive shell"
```

---

## Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: All unit/component tests**

Run: `npm run test:unit -- --run`
Expected: all suites PASS (format, range, delta, donutData, Waterfall, Heatmap, SalesChart, Donut).

- [ ] **Step 2: Types + lint**

Run: `npm run check && npm run lint`
Expected: no type errors; Prettier/ESLint clean. (Run `npm run format` if Prettier flags.)

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (confirms SSR safety — charts only touch the DOM in `onMount`).

- [ ] **Step 4: Manual viewport check**

Run: `npm run dev`, then with the backend reachable (proxy → `http://100.86.43.70:8085`) and logged in:

- Phone width (~390px): bottom tab bar present, no sidebar, single-column report, presets switch range, charts/heatmap render.
- Desktop width (≥1024px): left sidebar present, no bottom bar, content centered + wide, KPIs in 4 columns, charts in 2-up grid.
  Expected: both viewports usable; switching presets refetches and updates every section.

- [ ] **Step 5: Final commit (if formatting changed anything)**

```bash
git add -A
git commit -m "chore(manager): format + verification pass" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** sidebar shell (T11) ✓; presets (T10) ✓; KPIs+deltas (T3,T10) ✓; waterfall (T6) ✓; sales-by-day Chart.js (T8) ✓; donut (T9) ✓; heatmap (T7) ✓; top menus (T10) ✓; subsidies (T10) ✓; loading/error/empty (T10) ✓; Chart.js client-only + tree-shaken (T5,T8,T9) ✓; no backend changes ✓.
- **Type consistency:** `Preset`/`Range` (T2) used by `loadDashboard` (T4) and page (T10); `DashboardData` fields (`compare`,`salesByDay`,`heatmap`,`topMenus`,`subsidies`) consistent T4↔T10; `topNWithOther` signature consistent T5↔T9; `ensureChart`/`PALETTE` consistent T5↔T8↔T9; `data-testid` names consistent component↔test.
- **Out of scope (unchanged):** custom date range; Go-page retirement + dashboard re-gate (`mulan/TODO.md`).
