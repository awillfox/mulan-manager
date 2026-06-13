# Manager Build-out Plan 4 — Menu Manager

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> REQUIRED for every `.svelte` file: run the Svelte MCP `svelte-autofixer` until clean. Svelte 5 runes. No playground link.

**Goal:** The menu manager page — list menu items grouped by category, an item editor (name/price/category/vfd/active + base options + shared/isolated option-group attachment with a sequential dual-PUT save), and a categories management sheet.

**Architecture:** Reuse all iOS components + the `Picker` from Plan 2. A pure `serializeMenuGroups` helper (unit-tested) converts editor state → the `PUT …/option-groups` body. Money is THB floats.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind v4. Repo `/home/nate/Dev/mulan-manager` (branch `main`). **Depends on Plans 1 + 2.** Reuses `src/lib/api/optionGroups.ts` (Plan 3 Task 1) for the shared-preset list — **if Plan 3 hasn't run, create that client first** (its `listOptionGroups` + types).

**Contracts (verified):**
- `GET /api/menus` → `[{id, name, price (THB), category_id (int|null), vfd_name, active, option_groups:[{id, name, selection_mode, isolated, options:[{name, price_delta (THB)}]}], base_options:[{name, price (THB)}]}]`
- `POST/PATCH /api/menus` body `{name, price, category_id, vfd_name}`; `PATCH /api/menus/{id}/toggle`; `DELETE /api/menus/{id}`.
- `PUT /api/menus/{id}/option-groups` body `{groups:[ {isolated:false, id} | {isolated:true, name, selection_mode, options:[{name, price_delta}]} ]}` → 204.
- `PUT /api/menus/{id}/base-options` body `{base_options:[{name, price}]}` → 204.
- `GET/POST/PATCH/DELETE /api/menu-categories` — `{id, name}`.

---

### Task 1: Categories + menus typed clients

**Files:**
- Create: `src/lib/api/categories.ts`, `src/lib/api/menus.ts`

- [ ] **Step 1: Categories client**

Create `src/lib/api/categories.ts`:
```ts
export interface Category { id: number; name: string; }
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listCategories = () => fetch('/api/menu-categories').then((r) => j<Category[]>(r));
export const createCategory = (name: string) =>
	fetch('/api/menu-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then((r) => j<Category>(r));
export const updateCategory = (id: number, name: string) =>
	fetch(`/api/menu-categories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then((r) => j<Category>(r));
export const deleteCategory = (id: number) =>
	fetch(`/api/menu-categories/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
```

- [ ] **Step 2: Menus client**

Create `src/lib/api/menus.ts`:
```ts
import type { SelectionMode } from './optionGroups';

export interface MenuOption { name: string; price_delta: number; }
export interface MenuGroup {
	id: number; // shared preset id when isolated=false; clone id when isolated=true
	name: string;
	selection_mode: SelectionMode;
	isolated: boolean;
	options: MenuOption[];
}
export interface BaseOption { name: string; price: number; } // THB
export interface Menu {
	id: number;
	name: string;
	price: number; // THB
	category_id: number | null;
	vfd_name: string;
	active: boolean;
	option_groups: MenuGroup[];
	base_options: BaseOption[];
}
export interface MenuInput { name: string; price: number; category_id: number | null; vfd_name: string; }

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
async function ok(res: Response) { if (!res.ok) throw new Error(`HTTP ${res.status}`); }

export const listMenus = () => fetch('/api/menus').then((r) => j<Menu[]>(r));
export const createMenu = (m: MenuInput) =>
	fetch('/api/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).then((r) => j<Menu>(r));
export const updateMenu = (id: number, m: MenuInput) =>
	fetch(`/api/menus/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) }).then((r) => j<Menu>(r));
export const toggleMenu = (id: number) =>
	fetch(`/api/menus/${id}/toggle`, { method: 'PATCH' }).then(ok);
export const deleteMenu = (id: number) =>
	fetch(`/api/menus/${id}`, { method: 'DELETE' }).then(ok);

export interface SetGroupsBody { groups: ({ isolated: false; id: number } | { isolated: true; name: string; selection_mode: SelectionMode; options: MenuOption[] })[]; }
export const setMenuGroups = (id: number, body: SetGroupsBody) =>
	fetch(`/api/menus/${id}/option-groups`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(ok);
export const setMenuBaseOptions = (id: number, base_options: BaseOption[]) =>
	fetch(`/api/menus/${id}/base-options`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_options }) }).then(ok);
```

- [ ] **Step 3: check + commit**

Run `cd /home/nate/Dev/mulan-manager && npm run check`. Commit:
```bash
git add src/lib/api/categories.ts src/lib/api/menus.ts
git commit -m "feat: menus + categories typed clients"
```

---

### Task 2: `serializeMenuGroups` pure helper (TDD)

**Files:**
- Create: `src/lib/api/menuGroups.ts`
- Test: `src/lib/api/menuGroups.spec.ts`

This is the tricky bit — convert editor entries to the `PUT` body. Pure → unit-tested.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/menuGroups.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { serializeMenuGroups, type GroupEntry } from './menuGroups';

describe('serializeMenuGroups', () => {
	it('serializes a shared entry by id only', () => {
		const entries: GroupEntry[] = [
			{ kind: 'shared', sourceId: 5, name: 'Sweetness', selection_mode: 'single_required', options: [] }
		];
		expect(serializeMenuGroups(entries)).toEqual({ groups: [{ isolated: false, id: 5 }] });
	});
	it('serializes an isolated entry with options, dropping empty names and parsing deltas', () => {
		const entries: GroupEntry[] = [
			{
				kind: 'isolated', name: 'Custom', selection_mode: 'multi',
				options: [
					{ name: 'A', delta: '2.5' },
					{ name: '', delta: '9' },
					{ name: 'B', delta: '' }
				]
			}
		];
		expect(serializeMenuGroups(entries)).toEqual({
			groups: [{ isolated: true, name: 'Custom', selection_mode: 'multi', options: [
				{ name: 'A', price_delta: 2.5 },
				{ name: 'B', price_delta: 0 }
			] }]
		});
	});
});
```

- [ ] **Step 2: Run → FAIL**

Run: `cd /home/nate/Dev/mulan-manager && npm run test:unit -- --run src/lib/api/menuGroups.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/api/menuGroups.ts`:
```ts
import type { SelectionMode } from './optionGroups';
import type { SetGroupsBody } from './menus';

export type OptionRow = { id?: number; name: string; delta: string };

export type GroupEntry =
	| { kind: 'shared'; sourceId: number; name: string; selection_mode: SelectionMode; options: OptionRow[] }
	| { kind: 'isolated'; sourceId?: number; name: string; selection_mode: SelectionMode; options: OptionRow[] };

export function serializeMenuGroups(entries: GroupEntry[]): SetGroupsBody {
	return {
		groups: entries.map((e) =>
			e.kind === 'shared'
				? { isolated: false as const, id: e.sourceId }
				: {
						isolated: true as const,
						name: e.name.trim(),
						selection_mode: e.selection_mode,
						options: e.options
							.filter((o) => o.name.trim())
							.map((o) => ({ name: o.name.trim(), price_delta: parseFloat(o.delta) || 0 }))
					}
		)
	};
}
```

- [ ] **Step 4: Run → PASS**

Run: `npm run test:unit -- --run src/lib/api/menuGroups.spec.ts` → PASS (2).

- [ ] **Step 5: Commit**
```bash
git add src/lib/api/menuGroups.ts src/lib/api/menuGroups.spec.ts
git commit -m "feat: menu option-group serialization helper (tested)"
```

---

### Task 3: Categories management sheet component

**Files:**
- Create: `src/lib/components/CategoriesSheet.svelte`

A self-contained sheet the menu page opens to CRUD categories.

- [ ] **Step 1: Write the component**

Create `src/lib/components/CategoriesSheet.svelte`:
```svelte
<script lang="ts">
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listCategories, createCategory, updateCategory, deleteCategory, type Category } from '$lib/api/categories';

	let { open = $bindable(false), onchanged }: { open?: boolean; onchanged?: () => void } = $props();

	let cats = $state<Category[]>([]);
	let newName = $state('');

	async function refresh() {
		try { cats = await listCategories(); } catch (e) { showToast((e as Error).message, 'error'); }
	}
	async function add() {
		if (!newName.trim()) return;
		try { await createCategory(newName.trim()); newName = ''; await refresh(); onchanged?.(); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	async function rename(c: Category) {
		const name = prompt('Rename category', c.name);
		if (!name || !name.trim()) return;
		try { await updateCategory(c.id, name.trim()); await refresh(); onchanged?.(); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	async function remove(c: Category) {
		if (!confirm(`Delete "${c.name}"? Its items become uncategorized.`)) return;
		try { await deleteCategory(c.id); await refresh(); onchanged?.(); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	$effect(() => { if (open) refresh(); });
</script>

<BottomSheet bind:open title="Categories">
	<div class="space-y-3 pb-6">
		<div class="flex gap-2">
			<input bind:value={newName} placeholder="New category" class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
			<Button variant="tinted" onclick={add}>Add</Button>
		</div>
		{#each cats as c (c.id)}
			<div class="flex items-center justify-between border-b border-[var(--ios-separator)] py-2 last:border-0">
				<span class="text-[var(--ios-label)]">{c.name}</span>
				<div class="flex gap-3">
					<button type="button" onclick={() => rename(c)} class="text-[var(--ios-blue)]">Rename</button>
					<button type="button" onclick={() => remove(c)} class="text-[var(--ios-red)]">Delete</button>
				</div>
			</div>
		{/each}
	</div>
</BottomSheet>
```

- [ ] **Step 2: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add src/lib/components/CategoriesSheet.svelte
git commit -m "feat: categories management sheet"
```

---

### Task 4: Menu manager page + item editor

**Files:**
- Create: `src/routes/(app)/menu/+page.svelte`

- [ ] **Step 1: Write the page**

Create `src/routes/(app)/menu/+page.svelte`. The page: load menus + categories; render items grouped by `category_id` into sections (category name; null → "Uncategorized"); each row = name · `฿price` · active badge (tap badge → `toggleMenu`). NavBar trailing: a Categories button (opens `CategoriesSheet`) + `＋`. Item editor `BottomSheet`: fields + base-options editor + option-group editor (shared/isolated via a Customize toggle, Add via `Picker` of shared presets, plus "New one-off group"); save runs `createMenu`/`updateMenu` → `setMenuBaseOptions` → `setMenuGroups` sequentially with per-step error toasts.

```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Picker from '$lib/components/ios/Picker.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import CategoriesSheet from '$lib/components/CategoriesSheet.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listCategories, type Category } from '$lib/api/categories';
	import { listOptionGroups, type OptionGroup } from '$lib/api/optionGroups';
	import {
		listMenus, createMenu, updateMenu, toggleMenu, deleteMenu,
		setMenuBaseOptions, setMenuGroups, type Menu
	} from '$lib/api/menus';
	import { serializeMenuGroups, type GroupEntry, type OptionRow } from '$lib/api/menuGroups';

	let menus = $state<Menu[]>([]);
	let cats = $state<Category[]>([]);
	let presets = $state<OptionGroup[]>([]);
	let loading = $state(true);
	let catSheet = $state(false);
	let pickerOpen = $state(false);

	// editor state
	let sheetOpen = $state(false);
	let editingId = $state<number | null>(null);
	let fName = $state(''); let fVfd = $state(''); let fPrice = $state('');
	let fCat = $state<number | null>(null); let fActive = $state(true);
	let baseRows = $state<{ name: string; price: string }[]>([]);
	let groupEntries = $state<GroupEntry[]>([]);
	let saving = $state(false);

	const baht = (n: number) => '฿' + n.toFixed(2);
	const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? 'Uncategorized';
	const hasBase = $derived(baseRows.some((r) => r.name.trim()));

	const sections = $derived.by(() => {
		const by = new Map<number | null, Menu[]>();
		for (const m of menus) { const k = m.category_id; if (!by.has(k)) by.set(k, []); by.get(k)!.push(m); }
		return [...by.entries()].map(([cid, items]) => ({ cid, name: catName(cid), items }));
	});

	async function refresh() {
		loading = true;
		try { [menus, cats, presets] = await Promise.all([listMenus(), listCategories(), listOptionGroups()]); }
		catch (e) { showToast((e as Error).message, 'error'); }
		finally { loading = false; }
	}

	function openCreate() {
		editingId = null; fName = ''; fVfd = ''; fPrice = ''; fCat = null; fActive = true;
		baseRows = []; groupEntries = []; sheetOpen = true;
	}
	function openEdit(m: Menu) {
		editingId = m.id; fName = m.name; fVfd = m.vfd_name; fPrice = String(m.price);
		fCat = m.category_id; fActive = m.active;
		baseRows = m.base_options.map((b) => ({ name: b.name, price: String(b.price) }));
		groupEntries = m.option_groups.map((g): GroupEntry => {
			const options: OptionRow[] = g.options.map((o) => ({ name: o.name, delta: String(o.price_delta) }));
			return g.isolated
				? { kind: 'isolated', name: g.name, selection_mode: g.selection_mode, options }
				: { kind: 'shared', sourceId: g.id, name: g.name, selection_mode: g.selection_mode, options };
		});
		sheetOpen = true;
	}

	async function toggle(m: Menu) {
		try { await toggleMenu(m.id); await refresh(); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}

	// base options
	function addBase() { baseRows.push({ name: '', price: '' }); }
	function removeBase(i: number) { baseRows.splice(i, 1); }

	// option groups
	function attachShared(presetId: number) {
		const p = presets.find((x) => x.id === presetId);
		if (!p) return;
		groupEntries.push({ kind: 'shared', sourceId: p.id, name: p.name, selection_mode: p.selection_mode,
			options: p.options.map((o) => ({ name: o.name, delta: String(o.price_delta) })) });
	}
	function addOneOff() {
		groupEntries.push({ kind: 'isolated', name: 'New group', selection_mode: 'single_required', options: [{ name: '', delta: '' }] });
	}
	function detach(i: number) { groupEntries.splice(i, 1); }
	function toggleCustomize(i: number) {
		const e = groupEntries[i];
		if (e.kind === 'shared') groupEntries[i] = { kind: 'isolated', sourceId: e.sourceId, name: e.name, selection_mode: e.selection_mode, options: e.options.map((o) => ({ ...o })) };
		else if (e.sourceId != null) groupEntries[i] = { kind: 'shared', sourceId: e.sourceId, name: e.name, selection_mode: e.selection_mode, options: e.options };
		// a one-off isolated (no sourceId) cannot revert to shared — leave as-is
	}
	function addOpt(i: number) { groupEntries[i].options.push({ name: '', delta: '' }); }
	function removeOpt(i: number, k: number) { groupEntries[i].options.splice(k, 1); }

	const attachablePresets = $derived(
		presets.filter((p) => !groupEntries.some((e) => e.kind === 'shared' && e.sourceId === p.id))
	);

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		const price = parseFloat(fPrice) || 0;
		saving = true;
		try {
			let id = editingId;
			const input = { name: fName.trim(), price, category_id: fCat, vfd_name: fVfd.trim().slice(0, 20) };
			if (id == null) { const m = await createMenu(input); id = m.id; }
			else await updateMenu(id, input);

			const base = baseRows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), price: parseFloat(r.price) || 0 }));
			try { await setMenuBaseOptions(id, base); } catch (e) { throw new Error('Base options: ' + (e as Error).message); }
			try { await setMenuGroups(id, serializeMenuGroups(groupEntries)); } catch (e) { throw new Error('Option groups: ' + (e as Error).message); }

			sheetOpen = false; await refresh(); showToast('Saved');
		} catch (e) { showToast((e as Error).message, 'error'); }
		finally { saving = false; }
	}
	async function remove() {
		if (editingId == null) return;
		if (!confirm('Delete this item?')) return;
		try { await deleteMenu(editingId); sheetOpen = false; await refresh(); showToast('Deleted'); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	$effect(() => { refresh(); });
</script>

<NavBar title="Menu">
	{#snippet trailing()}
		<div class="flex items-center gap-3">
			<button type="button" onclick={() => (catSheet = true)} class="text-[var(--ios-blue)]">Categories</button>
			<Button variant="plain" onclick={openCreate}>＋</Button>
		</div>
	{/snippet}
</NavBar>

<div class="space-y-5 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else if menus.length === 0}
		<EmptyState title="No items" subtitle="Add your first menu item.">
			{#snippet action()}<Button onclick={openCreate}>Add Item</Button>{/snippet}
		</EmptyState>
	{:else}
		{#each sections as section (section.cid)}
			<div>
				<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">{section.name}</p>
				<Card padded={false}>
					{#each section.items as m, i (m.id)}
						<ListRow divider={i < section.items.length - 1} onclick={() => openEdit(m)}>
							<span class="font-medium text-[var(--ios-label)]">{m.name}</span>
							{#snippet trailing()}
								<div class="flex items-center gap-3">
									<span class="text-[var(--ios-label-secondary)]">{baht(m.price)}</span>
									<button type="button" onclick={(e) => { e.stopPropagation(); toggle(m); }} class="rounded-full px-2 py-0.5 text-xs {m.active ? 'bg-[var(--ios-green)]/15 text-[var(--ios-green)]' : 'bg-[var(--ios-fill)] text-[var(--ios-label-secondary)]'}">
										{m.active ? 'On' : 'Off'}
									</button>
								</div>
							{/snippet}
						</ListRow>
					{/each}
				</Card>
			</div>
		{/each}
	{/if}
</div>

<CategoriesSheet bind:open={catSheet} onchanged={refresh} />

<Picker
	bind:open={pickerOpen}
	title="Attach a group"
	options={attachablePresets.map((p) => ({ label: p.name, value: p.id }))}
	onselect={(v) => typeof v === 'number' && attachShared(v)}
/>

<BottomSheet bind:open={sheetOpen} title={editingId == null ? 'New Item' : 'Edit Item'}>
	<div class="space-y-4 pb-6">
		<TextField label="Name" bind:value={fName} placeholder="e.g. Iced Coffee" />
		<TextField label="VFD name (≤20)" bind:value={fVfd} placeholder="ICED COFFEE" />
		<div>
			<TextField label="Price (฿)" bind:value={fPrice} inputmode="decimal" placeholder="50.00" />
			{#if hasBase}<p class="mt-1 text-xs text-[var(--ios-label-tertiary)]">Ignored — base options set the price.</p>{/if}
		</div>
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Category</span>
			<select bind:value={fCat} class="h-11 w-full rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)]">
				<option value={null}>Uncategorized</option>
				{#each cats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>

		<!-- Base options -->
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Base options (name · ฿ absolute price)</span>
			<div class="space-y-2">
				{#each baseRows as row, i (i)}
					<div class="flex items-center gap-2">
						<input bind:value={row.name} placeholder="e.g. Iced" class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
						<input bind:value={row.price} inputmode="decimal" placeholder="50.00" class="h-11 w-24 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
						<button type="button" aria-label="Remove" onclick={() => removeBase(i)} class="px-2 text-[var(--ios-red)]">✕</button>
					</div>
				{/each}
			</div>
			<button type="button" onclick={addBase} class="mt-2 text-[var(--ios-blue)]">＋ Add base option</button>
		</div>

		<!-- Option groups -->
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Option groups</span>
			<div class="space-y-3">
				{#each groupEntries as entry, i (i)}
					<Card>
						<div class="flex items-center justify-between">
							<span class="font-medium text-[var(--ios-label)]">{entry.name || 'Group'}</span>
							<button type="button" aria-label="Detach" onclick={() => detach(i)} class="text-[var(--ios-red)]">Remove</button>
						</div>
						<label class="mt-2 flex items-center justify-between">
							<span class="text-sm text-[var(--ios-label-secondary)]">Customize (private to this item)</span>
							<input type="checkbox" checked={entry.kind === 'isolated'} onchange={() => toggleCustomize(i)} />
						</label>
						{#if entry.kind === 'isolated'}
							<div class="mt-2 space-y-2">
								<input bind:value={entry.name} placeholder="Group name" class="h-10 w-full rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
								{#each entry.options as opt, k (k)}
									<div class="flex items-center gap-2">
										<input bind:value={opt.name} placeholder="Option" class="h-10 flex-1 rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
										<input bind:value={opt.delta} inputmode="decimal" placeholder="±0.00" class="h-10 w-20 rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
										<button type="button" aria-label="Remove option" onclick={() => removeOpt(i, k)} class="px-1 text-[var(--ios-red)]">✕</button>
									</div>
								{/each}
								<button type="button" onclick={() => addOpt(i)} class="text-[var(--ios-blue)]">＋ Add option</button>
							</div>
						{:else}
							<div class="mt-2 text-sm text-[var(--ios-label-secondary)]">
								Shared preset · {entry.options.length} options · syncs with the preset
							</div>
						{/if}
					</Card>
				{/each}
			</div>
			<div class="mt-2 flex gap-3">
				<button type="button" onclick={() => (pickerOpen = true)} class="text-[var(--ios-blue)]" disabled={attachablePresets.length === 0}>＋ Attach preset</button>
				<button type="button" onclick={addOneOff} class="text-[var(--ios-blue)]">＋ New one-off group</button>
			</div>
		</div>

		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editingId != null}<Button variant="destructive" onclick={remove}>Delete</Button>{/if}
	</div>
</BottomSheet>
```

- [ ] **Step 2: autofixer + check + build**

Run `svelte-autofixer` on the page until clean. Then `cd /home/nate/Dev/mulan-manager && npm run check && npm run build`. Fix any issues.

- [ ] **Step 3: Manual verify (backend running + logged in as owner)**

`npm run dev`; open `/menu`. Verify: items load grouped by category; toggling the On/Off badge persists; ＋ opens the editor; create an item with a category + price; add a base option (price field note appears); attach a shared preset; tick Customize → it becomes editable; add a one-off group; Save → item appears; re-open shows the saved groups/base options; Categories button manages categories. Watch the network tab: `PATCH /api/menus` then `PUT …/base-options` then `PUT …/option-groups`, each 200/204.

- [ ] **Step 4: Commit**
```bash
git add "src/routes/(app)/menu/"
git commit -m "feat: menu manager page (items, categories, base options, option-group attach)"
```

---

### Task 5: e2e — menu create flow

**Files:**
- Modify: `e2e/login-flow.spec.ts` (or create `e2e/menu.spec.ts`)

- [ ] **Step 1: Add the e2e**

Create `e2e/menu.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
const USER = process.env.E2E_USER ?? 'owner';
const PASS = process.env.E2E_PASS ?? 'changeme123';

test('owner creates a menu item', async ({ page }) => {
	await page.goto('/login');
	await page.fill('input[name="username"]', USER);
	await page.fill('input[name="password"]', PASS);
	await page.click('button[type="submit"]');
	await expect(page).toHaveURL('/');

	const loaded = page.waitForResponse((r) => r.url().includes('/api/menus') && r.request().method() === 'GET');
	await page.getByRole('link', { name: 'Menu' }).click();
	await expect(page.getByRole('heading', { name: 'Menu' })).toBeVisible();
	await loaded;

	const name = 'E2E Item ' + Date.now();
	await page.getByRole('button', { name: '＋', exact: true }).click();
	await expect(page.getByPlaceholder('e.g. Iced Coffee')).toBeVisible();
	await page.getByPlaceholder('e.g. Iced Coffee').fill(name);
	await page.getByPlaceholder('50.00').first().fill('45');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect(page.getByText(name)).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

With the backend running (seeded owner) + `BACKEND_URL` pointed at it: `cd /home/nate/Dev/mulan-manager && npx playwright test e2e/menu.spec.ts --reporter=line`. Expect 1 passed. Clean up the created item afterward (DELETE the `E2E Item %` menus via psql, or leave — they're harmless test data; prefer cleaning).

- [ ] **Step 3: Commit**
```bash
git add e2e/menu.spec.ts
git commit -m "test: e2e menu item creation"
```

---

## Self-Review (completed)

- **Spec §5.1 coverage:** items grouped by category + toggle (Task 4 page); item editor with name/vfd/price/category/active (Task 4); base options editor + price-greying note (Task 4); option-group editor shared/isolated + Customize + Picker attach + one-off (Task 4); sequential `PATCH menu → PUT base-options → PUT option-groups` with per-step error toasts (Task 4 `save`); categories sheet (Task 3); serialization (Task 2, tested). Inline shared-preset creation deliberately omitted per spec §5.1/§10.
- **No placeholders:** full code for clients, helper+test, categories sheet, the page/editor, and the e2e.
- **Type consistency:** `Menu`/`MenuGroup`/`BaseOption`/`MenuInput`/`SetGroupsBody` (Task 1) consumed by Task 4; `GroupEntry`/`OptionRow`/`serializeMenuGroups` (Task 2) consumed by Task 4; `SelectionMode`/`OptionGroup` from `optionGroups.ts`. The editor maps a loaded `Menu.option_groups[]` (`isolated` bool, preset id) into `GroupEntry` and back via `serializeMenuGroups` — round-trip consistent with the `PUT` contract.
- **Reuse:** `Picker` (Plan 2), `BottomSheet`/`Card`/`ListRow`/`Toggle`/`TextField`/`Button`/`Spinner`/`EmptyState` (existing). A native `<select>` is used for category (simple, accessible); `Picker` is used for preset attach (longer/iOS-styled list).

## Out of scope
Per spec §10: inline shared-preset creation from the menu dialog, drag-reordering, redemption. Sort order is positional.
