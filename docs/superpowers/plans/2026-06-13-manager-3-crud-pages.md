# Manager Build-out Plan 3 — CRUD Pages (option-groups, members, cashiers, settings)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> REQUIRED for every `.svelte` file: run the Svelte MCP `svelte-autofixer` until clean. Svelte 5 runes. No playground link.

**Goal:** Four manager pages — Option Groups, Members, Cashiers, Settings — reusing the discounts-page pattern + the components from Plan 2.

**Architecture:** Each page: a typed client in `src/lib/api/<feature>.ts` (fetching the proxied `/api/*`), an `(app)/<feature>/+page.svelte` with NavBar + list/search + add/edit `BottomSheet` (Settings is a form). Money is THB floats; format with `฿${n.toFixed(2)}`.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind v4. Repo `/home/nate/Dev/mulan-manager` (branch `main`). **Depends on Plans 1 + 2.**

**Canonical reference (mirror its list/search/sheet structure):** `src/routes/(app)/discounts/+page.svelte` and `src/lib/api/discounts.ts`. The patterns below specify only what differs.

---

### Task 1: Option Groups — typed client

**Files:**
- Create: `src/lib/api/optionGroups.ts`
- Test: `src/lib/api/optionGroups.spec.ts`

- [ ] **Step 1: Write the failing test (pure serialization helper)**

Create `src/lib/api/optionGroups.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SELECTION_MODES, isSelectionMode } from './optionGroups';

describe('option group selection modes', () => {
	it('lists the three modes', () => {
		expect(SELECTION_MODES.map((m) => m.value)).toEqual([
			'single_required',
			'single_optional',
			'multi'
		]);
	});
	it('validates a mode', () => {
		expect(isSelectionMode('multi')).toBe(true);
		expect(isSelectionMode('nope')).toBe(false);
	});
});
```

- [ ] **Step 2: Run it, verify FAIL**

Run: `cd /home/nate/Dev/mulan-manager && npm run test:unit -- --run src/lib/api/optionGroups.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Write the client**

Create `src/lib/api/optionGroups.ts`:
```ts
export type SelectionMode = 'single_required' | 'single_optional' | 'multi';

export const SELECTION_MODES: { label: string; value: SelectionMode }[] = [
	{ label: 'Pick one (required)', value: 'single_required' },
	{ label: 'Pick one (optional)', value: 'single_optional' },
	{ label: 'Pick any', value: 'multi' }
];

export function isSelectionMode(v: string): v is SelectionMode {
	return v === 'single_required' || v === 'single_optional' || v === 'multi';
}

export interface OptionItem {
	id?: number;
	name: string;
	price_delta: number; // THB
	sort_order: number;
}
export interface OptionGroup {
	id: number;
	name: string;
	selection_mode: SelectionMode;
	options: OptionItem[];
}

async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}

export const listOptionGroups = () =>
	fetch('/api/option-groups').then((r) => j<OptionGroup[]>(r));

export const createOptionGroup = (name: string, selection_mode: SelectionMode) =>
	fetch('/api/option-groups', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, selection_mode })
	}).then((r) => j<OptionGroup>(r));

export const updateOptionGroup = (id: number, name: string, selection_mode: SelectionMode) =>
	fetch(`/api/option-groups/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, selection_mode })
	}).then((r) => j<OptionGroup>(r));

export const deleteOptionGroup = (id: number) =>
	fetch(`/api/option-groups/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});

export const createOption = (groupId: number, o: Omit<OptionItem, 'id'>) =>
	fetch(`/api/option-groups/${groupId}/options`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(o)
	}).then((r) => j<OptionItem>(r));

export const updateOption = (id: number, o: Omit<OptionItem, 'id'>) =>
	fetch(`/api/options/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(o)
	}).then((r) => j<OptionItem>(r));

export const deleteOption = (id: number) =>
	fetch(`/api/options/${id}`, { method: 'DELETE' }).then((r) => {
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
	});
```

- [ ] **Step 4: Run tests → PASS**

Run: `npm run test:unit -- --run src/lib/api/optionGroups.spec.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/api/optionGroups.ts src/lib/api/optionGroups.spec.ts
git commit -m "feat: option-groups typed client"
```

---

### Task 2: Option Groups — page

**Files:**
- Create: `src/routes/(app)/option-groups/+page.svelte`

- [ ] **Step 1: Write the page**

Mirror `discounts/+page.svelte` structure (NavBar + `＋ New`, list in a `Card`, add/edit `BottomSheet`, `showToast`, `$effect(refresh)`). Differences: each list row shows `group.name` + a subtitle `mode • N options`. The edit sheet has: a `TextField` name, a `SegmentedControl` bound to `selection_mode` (options from `SELECTION_MODES`), and an **options editor** — an inline repeatable list of `{name, price_delta}` rows (see Plan 2 Task 5 pattern). Save logic:
- Create group: `createOptionGroup(name, mode)` → then for each non-empty option row, `createOption(group.id, {name, price_delta: parseFloat(delta)||0, sort_order: index})`.
- Edit group: `updateOptionGroup(id, name, mode)`; diff option rows against the loaded set — `createOption` for new rows, `updateOption` for changed existing (carry `id`), `deleteOption` for removed. (Track each row's optional `id`.)

Create `src/routes/(app)/option-groups/+page.svelte`:
```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		listOptionGroups, createOptionGroup, updateOptionGroup, deleteOptionGroup,
		createOption, updateOption, deleteOption,
		SELECTION_MODES, type OptionGroup, type SelectionMode, type OptionItem
	} from '$lib/api/optionGroups';

	let groups = $state<OptionGroup[]>([]);
	let loading = $state(true);
	let sheetOpen = $state(false);
	let editing = $state<OptionGroup | null>(null);
	let fName = $state('');
	let fMode = $state<SelectionMode>('single_required');
	type Row = { id?: number; name: string; delta: string };
	let rows = $state<Row[]>([]);
	let saving = $state(false);

	const modeLabel = (m: SelectionMode) => SELECTION_MODES.find((x) => x.value === m)?.label ?? m;

	async function refresh() {
		loading = true;
		try { groups = await listOptionGroups(); }
		catch (e) { showToast((e as Error).message, 'error'); }
		finally { loading = false; }
	}
	function openCreate() {
		editing = null; fName = ''; fMode = 'single_required'; rows = [{ name: '', delta: '' }]; sheetOpen = true;
	}
	function openEdit(g: OptionGroup) {
		editing = g; fName = g.name; fMode = g.selection_mode;
		rows = g.options.map((o) => ({ id: o.id, name: o.name, delta: String(o.price_delta) }));
		if (rows.length === 0) rows = [{ name: '', delta: '' }];
		sheetOpen = true;
	}
	function addRow() { rows.push({ name: '', delta: '' }); }
	function removeRow(i: number) { rows.splice(i, 1); }

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		saving = true;
		try {
			let groupId: number;
			if (editing) { await updateOptionGroup(editing.id, fName.trim(), fMode); groupId = editing.id; }
			else { const g = await createOptionGroup(fName.trim(), fMode); groupId = g.id; }

			const before = new Map<number, OptionItem>((editing?.options ?? []).map((o) => [o.id!, o]));
			const keep = new Set<number>();
			for (let i = 0; i < rows.length; i++) {
				const r = rows[i];
				if (!r.name.trim()) continue;
				const payload = { name: r.name.trim(), price_delta: parseFloat(r.delta) || 0, sort_order: i };
				if (r.id) { keep.add(r.id); await updateOption(r.id, payload); }
				else { await createOption(groupId, payload); }
			}
			for (const id of before.keys()) if (!keep.has(id)) await deleteOption(id);

			sheetOpen = false; await refresh(); showToast('Saved');
		} catch (e) { showToast((e as Error).message, 'error'); }
		finally { saving = false; }
	}
	async function remove() {
		if (!editing) return;
		if (!confirm('Delete this group? Isolated copies on menus are orphaned.')) return;
		try { await deleteOptionGroup(editing.id); sheetOpen = false; await refresh(); showToast('Deleted'); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	$effect(() => { refresh(); });
</script>

<NavBar title="Option Groups">
	{#snippet trailing()}<Button variant="plain" onclick={openCreate}>＋ New</Button>{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else if groups.length === 0}
		<EmptyState title="No option groups" subtitle="Create reusable add-on groups for menus.">
			{#snippet action()}<Button onclick={openCreate}>Create Group</Button>{/snippet}
		</EmptyState>
	{:else}
		<Card padded={false}>
			{#each groups as g, i (g.id)}
				<ListRow divider={i < groups.length - 1} onclick={() => openEdit(g)}>
					<div>
						<div class="font-medium text-[var(--ios-label)]">{g.name}</div>
						<div class="text-sm text-[var(--ios-label-secondary)]">{modeLabel(g.selection_mode)} • {g.options.length} options</div>
					</div>
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={sheetOpen} title={editing ? 'Edit Group' : 'New Group'}>
	<div class="space-y-4 pb-6">
		<TextField label="Name" bind:value={fName} placeholder="e.g. Sweetness" />
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Selection</span>
			<SegmentedControl bind:value={fMode} options={SELECTION_MODES.map((m) => ({ label: m.label, value: m.value }))} />
		</div>
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Options (name · ฿ delta)</span>
			<div class="space-y-2">
				{#each rows as row, i (i)}
					<div class="flex items-center gap-2">
						<input bind:value={row.name} placeholder="Option" class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
						<input bind:value={row.delta} inputmode="decimal" placeholder="0.00" class="h-11 w-24 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
						<button type="button" aria-label="Remove" onclick={() => removeRow(i)} class="px-2 text-[var(--ios-red)]">✕</button>
					</div>
				{/each}
			</div>
			<button type="button" onclick={addRow} class="mt-2 text-[var(--ios-blue)]">＋ Add option</button>
		</div>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editing}<Button variant="destructive" onclick={remove}>Delete</Button>{/if}
	</div>
</BottomSheet>
```

- [ ] **Step 2: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add "src/routes/(app)/option-groups/"
git commit -m "feat: option groups manager page"
```

---

### Task 3: Members — typed client + page

**Files:**
- Create: `src/lib/api/members.ts`, `src/routes/(app)/members/+page.svelte`

- [ ] **Step 1: Typed client**

Create `src/lib/api/members.ts`:
```ts
export interface Member {
	id: number;
	phone: string;
	name: string;
	points: number;
	created_at: string;
}
export interface MemberOrder {
	code: string;
	created_at: string;
	points_earned: number;
	subtotal: number; // THB
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listMembers = (q = '') =>
	fetch(`/api/members${q ? `?q=${encodeURIComponent(q)}` : ''}`).then((r) => j<Member[]>(r));
export const memberOrders = (id: number) =>
	fetch(`/api/members/${id}/orders`).then((r) => j<MemberOrder[]>(r));
export const createMember = (phone: string, name: string) =>
	fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, name }) })
		.then(async (r) => { if (r.status === 409) throw new Error('Phone already registered'); return j<Member>(r); });
export const updateMember = (id: number, phone: string, name: string) =>
	fetch(`/api/members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, name }) })
		.then(async (r) => { if (r.status === 409) throw new Error('Phone already registered'); return j<Member>(r); });
export const deleteMember = (id: number) =>
	fetch(`/api/members/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
```

- [ ] **Step 2: Page**

Create `src/routes/(app)/members/+page.svelte` mirroring the discounts page, with: NavBar "Members" + `＋ New`; a `SearchBar` bound to `query` that **re-fetches server-side** (`listMembers(query)`) debounced via `$effect` on `query` (or a simple on-change refetch); rows show `name` (or "(no name)") · `phone` · a points badge. Add/edit `BottomSheet`: `TextField` phone (`inputmode="numeric"`), `TextField` name. Tapping a row opens a **detail BottomSheet**: header (name/phone), points balance, and an order-history list from `memberOrders(id)` (`code` · date · `+points_earned` · `฿subtotal.toFixed(2)`), plus an Edit and a Delete button. Use `showToast` for the 409 path. Full code follows the discounts page; the only new piece is the detail sheet calling `memberOrders`.
```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import SearchBar from '$lib/components/ios/SearchBar.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listMembers, memberOrders, createMember, updateMember, deleteMember, type Member, type MemberOrder } from '$lib/api/members';

	let members = $state<Member[]>([]);
	let loading = $state(true);
	let query = $state('');
	let editOpen = $state(false);
	let detailOpen = $state(false);
	let selected = $state<Member | null>(null);
	let orders = $state<MemberOrder[]>([]);
	let fPhone = $state('');
	let fName = $state('');
	let saving = $state(false);

	const baht = (n: number) => '฿' + n.toFixed(2);

	async function refresh() {
		loading = true;
		try { members = await listMembers(query); }
		catch (e) { showToast((e as Error).message, 'error'); }
		finally { loading = false; }
	}
	function openCreate() { selected = null; fPhone = ''; fName = ''; editOpen = true; }
	function openEdit(m: Member) { selected = m; fPhone = m.phone; fName = m.name; editOpen = true; detailOpen = false; }
	async function openDetail(m: Member) {
		selected = m; detailOpen = true; orders = [];
		try { orders = await memberOrders(m.id); } catch (e) { showToast((e as Error).message, 'error'); }
	}
	async function save() {
		if (!fPhone.trim()) return showToast('Phone is required', 'error');
		saving = true;
		try {
			if (selected) await updateMember(selected.id, fPhone.trim(), fName.trim());
			else await createMember(fPhone.trim(), fName.trim());
			editOpen = false; await refresh(); showToast('Saved');
		} catch (e) { showToast((e as Error).message, 'error'); }
		finally { saving = false; }
	}
	async function remove() {
		if (!selected) return;
		if (!confirm('Delete this member? Past orders are kept.')) return;
		try { await deleteMember(selected.id); detailOpen = false; editOpen = false; await refresh(); showToast('Deleted'); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	$effect(() => { query; refresh(); });
</script>

<NavBar title="Members">
	{#snippet trailing()}<Button variant="plain" onclick={openCreate}>＋ New</Button>{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	<SearchBar bind:value={query} placeholder="Search name or phone" />
	{#if loading}
		<Spinner />
	{:else if members.length === 0}
		<EmptyState title={query ? 'No matches' : 'No members'} subtitle={query ? 'Try another search.' : 'Add your first member.'} />
	{:else}
		<Card padded={false}>
			{#each members as m, i (m.id)}
				<ListRow divider={i < members.length - 1} onclick={() => openDetail(m)}>
					<div>
						<div class="font-medium text-[var(--ios-label)]">{m.name || '(no name)'}</div>
						<div class="text-sm text-[var(--ios-label-secondary)]">{m.phone}</div>
					</div>
					{#snippet trailing()}<span class="text-[var(--ios-label-secondary)]">{m.points} pts</span>{/snippet}
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={detailOpen} title={selected?.name || selected?.phone}>
	<div class="space-y-4 pb-6">
		<Card><div class="flex items-center justify-between"><span class="text-[var(--ios-label-secondary)]">Points</span><span class="text-xl font-bold text-[var(--ios-label)]">{selected?.points ?? 0}</span></div></Card>
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Order history</p>
			{#if orders.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No paid orders yet.</p></Card>
			{:else}
				<Card padded={false}>
					{#each orders as o, i (o.code)}
						<div class="flex items-center justify-between px-4 py-3 {i < orders.length - 1 ? 'border-b border-[var(--ios-separator)]' : ''}">
							<span class="text-[var(--ios-label)]">{o.code}</span>
							<span class="text-[var(--ios-label-secondary)]">+{o.points_earned} · {baht(o.subtotal)}</span>
						</div>
					{/each}
				</Card>
			{/if}
		</div>
		<Button onclick={() => selected && openEdit(selected)}>Edit</Button>
		<Button variant="destructive" onclick={remove}>Delete</Button>
	</div>
</BottomSheet>

<BottomSheet bind:open={editOpen} title={selected ? 'Edit Member' : 'New Member'}>
	<div class="space-y-4 pb-6">
		<TextField label="Phone" bind:value={fPhone} inputmode="numeric" placeholder="0812345678" />
		<TextField label="Name" bind:value={fName} placeholder="optional" />
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	</div>
</BottomSheet>
```

- [ ] **Step 3: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add src/lib/api/members.ts "src/routes/(app)/members/"
git commit -m "feat: members manager page (list/search/detail/CRUD)"
```

---

### Task 4: Cashiers — typed client + page

**Files:**
- Create: `src/lib/api/cashiers.ts`, `src/routes/(app)/cashiers/+page.svelte`

- [ ] **Step 1: Typed client**

Create `src/lib/api/cashiers.ts`:
```ts
export interface Cashier { id: number; login_id: string; name: string; active: boolean; }
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const listCashiers = () => fetch('/api/cashiers').then((r) => j<Cashier[]>(r));
export const createCashier = (login_id: string, name: string, pin: string) =>
	fetch('/api/cashiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login_id, name, pin }) })
		.then(async (r) => { if (r.status === 409) throw new Error('Login ID already in use'); return j<Cashier>(r); });
export const updateCashier = (id: number, name: string, active: boolean) =>
	fetch(`/api/cashiers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, active }) }).then((r) => j<Cashier>(r));
export const updateCashierPin = (id: number, pin: string) =>
	fetch(`/api/cashiers/${id}/pin`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
		.then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
export const deleteCashier = (id: number) =>
	fetch(`/api/cashiers/${id}`, { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
```

- [ ] **Step 2: Page**

Create `src/routes/(app)/cashiers/+page.svelte` mirroring discounts. List rows: `name` · `login_id` · active badge (greyed "Off" when inactive). Add sheet (create): `TextField` login_id, name, PIN (`inputmode="numeric"`), `Toggle` active. Edit sheet: name `TextField` + active `Toggle` (`updateCashier`), plus a **Change PIN** field + button (`updateCashierPin`, PIN ≥4 digits). Validate PIN length on create + change. 409 → toast. Delete with confirm.
```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { listCashiers, createCashier, updateCashier, updateCashierPin, deleteCashier, type Cashier } from '$lib/api/cashiers';

	let cashiers = $state<Cashier[]>([]);
	let loading = $state(true);
	let sheetOpen = $state(false);
	let editing = $state<Cashier | null>(null);
	let fLogin = $state('');
	let fName = $state('');
	let fPin = $state('');
	let fActive = $state(true);
	let newPin = $state('');
	let saving = $state(false);

	async function refresh() {
		loading = true;
		try { cashiers = await listCashiers(); } catch (e) { showToast((e as Error).message, 'error'); } finally { loading = false; }
	}
	function openCreate() { editing = null; fLogin = ''; fName = ''; fPin = ''; fActive = true; newPin = ''; sheetOpen = true; }
	function openEdit(c: Cashier) { editing = c; fLogin = c.login_id; fName = c.name; fActive = c.active; newPin = ''; sheetOpen = true; }

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		saving = true;
		try {
			if (editing) await updateCashier(editing.id, fName.trim(), fActive);
			else {
				if (!fLogin.trim()) { saving = false; return showToast('Login ID is required', 'error'); }
				if (fPin.length < 4) { saving = false; return showToast('PIN must be at least 4 digits', 'error'); }
				await createCashier(fLogin.trim(), fName.trim(), fPin);
			}
			sheetOpen = false; await refresh(); showToast('Saved');
		} catch (e) { showToast((e as Error).message, 'error'); } finally { saving = false; }
	}
	async function changePin() {
		if (!editing) return;
		if (newPin.length < 4) return showToast('PIN must be at least 4 digits', 'error');
		try { await updateCashierPin(editing.id, newPin); newPin = ''; showToast('PIN updated'); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	async function remove() {
		if (!editing) return;
		if (!confirm('Delete this cashier?')) return;
		try { await deleteCashier(editing.id); sheetOpen = false; await refresh(); showToast('Deleted'); }
		catch (e) { showToast((e as Error).message, 'error'); }
	}
	$effect(() => { refresh(); });
</script>

<NavBar title="Cashiers">
	{#snippet trailing()}<Button variant="plain" onclick={openCreate}>＋ New</Button>{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else if cashiers.length === 0}
		<EmptyState title="No cashiers" subtitle="Add POS staff logins.">
			{#snippet action()}<Button onclick={openCreate}>Add Cashier</Button>{/snippet}
		</EmptyState>
	{:else}
		<Card padded={false}>
			{#each cashiers as c, i (c.id)}
				<ListRow divider={i < cashiers.length - 1} onclick={() => openEdit(c)}>
					<div class="flex items-center gap-2">
						<span class="font-medium text-[var(--ios-label)]">{c.name}</span>
						<span class="text-sm text-[var(--ios-label-secondary)]">{c.login_id}</span>
						{#if !c.active}<span class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-label-secondary)]">Off</span>{/if}
					</div>
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={sheetOpen} title={editing ? 'Edit Cashier' : 'New Cashier'}>
	<div class="space-y-4 pb-6">
		{#if !editing}
			<TextField label="Login ID" bind:value={fLogin} placeholder="e.g. nate" />
		{/if}
		<TextField label="Name" bind:value={fName} placeholder="Display name" />
		{#if !editing}
			<TextField label="PIN (min 4 digits)" bind:value={fPin} inputmode="numeric" type="password" placeholder="••••" />
		{/if}
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editing}
			<div class="space-y-2">
				<span class="block text-sm text-[var(--ios-label-secondary)]">Change PIN</span>
				<div class="flex gap-2">
					<input bind:value={newPin} inputmode="numeric" type="password" placeholder="new PIN" class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none" />
					<Button variant="tinted" onclick={changePin}>Update</Button>
				</div>
			</div>
			<Button variant="destructive" onclick={remove}>Delete</Button>
		{/if}
	</div>
</BottomSheet>
```

- [ ] **Step 3: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add src/lib/api/cashiers.ts "src/routes/(app)/cashiers/"
git commit -m "feat: cashiers manager page (CRUD + change PIN)"
```

---

### Task 5: Settings — typed client + form page

**Files:**
- Create: `src/lib/api/settings.ts`, `src/routes/(app)/settings/+page.svelte`

- [ ] **Step 1: Typed client**

Create `src/lib/api/settings.ts`:
```ts
export interface Settings {
	shop_name: string;
	vat_percent: number;
	receipt_footer: string;
	points_per_baht: number;
}
async function j<T>(res: Response): Promise<T> {
	const b = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(b?.error || `HTTP ${res.status}`);
	return b.data as T;
}
export const getSettings = () => fetch('/api/settings').then((r) => j<Settings>(r));
export const updateSettings = (s: Settings) =>
	fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }).then((r) => j<Settings>(r));
export const uploadLogo = (file: File) => {
	const fd = new FormData();
	fd.append('file', file);
	return fetch('/api/settings/logo', { method: 'PUT', body: fd }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
};
export const deleteLogo = () =>
	fetch('/api/settings/logo', { method: 'DELETE' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });
```

> NOTE: `uploadLogo` sends `multipart/form-data` — do NOT set a `Content-Type` header (the browser sets the boundary). The proxy forwards the body + the browser's content-type through to the backend.

- [ ] **Step 2: Page**

Create `src/routes/(app)/settings/+page.svelte` — a form (not a list). Loads `getSettings()`; grouped-list rows for shop_name, vat_percent (numeric), receipt_footer, points_per_baht (numeric); a `LogoUpload` wired to `uploadLogo`/`deleteLogo` (bump a `logoVersion` to cache-bust after change); a Save button → `updateSettings`. Owner-only on the backend: a staff session gets 403 → toast "Owner only".
```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import LogoUpload from '$lib/components/ios/LogoUpload.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { getSettings, updateSettings, uploadLogo, deleteLogo, type Settings } from '$lib/api/settings';

	let s = $state<Settings | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let logoVersion = $state(0);
	// string-bound inputs for numeric fields
	let vat = $state('');
	let ppb = $state('');

	async function load() {
		loading = true;
		try { s = await getSettings(); vat = String(s.vat_percent); ppb = String(s.points_per_baht); }
		catch (e) { showToast((e as Error).message, 'error'); }
		finally { loading = false; }
	}
	async function save() {
		if (!s) return;
		const vatN = parseFloat(vat), ppbN = parseFloat(ppb);
		if (!s.shop_name.trim()) return showToast('Shop name is required', 'error');
		if (Number.isNaN(vatN) || vatN < 0 || vatN > 100) return showToast('VAT must be 0–100', 'error');
		if (Number.isNaN(ppbN) || ppbN < 0) return showToast('Points/baht must be ≥ 0', 'error');
		saving = true;
		try {
			await updateSettings({ ...s, vat_percent: vatN, points_per_baht: ppbN });
			showToast('Saved');
		} catch (e) {
			const m = (e as Error).message;
			showToast(m.includes('403') ? 'Owner only' : m, 'error');
		} finally { saving = false; }
	}
	async function onpick(file: File) {
		try { await uploadLogo(file); logoVersion++; showToast('Logo updated'); }
		catch (e) { const m = (e as Error).message; showToast(m.includes('403') ? 'Owner only' : m, 'error'); }
	}
	async function onremove() {
		try { await deleteLogo(); logoVersion++; showToast('Logo removed'); }
		catch (e) { const m = (e as Error).message; showToast(m.includes('403') ? 'Owner only' : m, 'error'); }
	}
	$effect(() => { load(); });
</script>

<NavBar title="Settings" />

<div class="space-y-5 px-4 pt-2 pb-6">
	{#if loading || !s}
		<Spinner />
	{:else}
		<Card><LogoUpload version={logoVersion} {onpick} {onremove} /></Card>
		<div class="space-y-4">
			<TextField label="Shop name" bind:value={s.shop_name} placeholder="My Shop" />
			<TextField label="VAT %" bind:value={vat} inputmode="decimal" placeholder="7" />
			<TextField label="Points per ฿" bind:value={ppb} inputmode="decimal" placeholder="1" />
			<TextField label="Receipt footer" bind:value={s.receipt_footer} placeholder="Thank you!" />
		</div>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	{/if}
</div>
```

- [ ] **Step 3: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check && npm run build`. Commit:
```bash
git add src/lib/api/settings.ts "src/routes/(app)/settings/"
git commit -m "feat: settings page (shop config + logo upload)"
```

---

## Self-Review (completed)

- **Spec coverage:** §5.2 option-groups (Task 1–2), §5.3 members + detail/orders (Task 3), §5.4 cashiers + change-PIN (Task 4), §5.5 settings form + logo (Task 5) ✓.
- **No placeholders:** every page + client has complete code. The members/cashiers/settings pages are given in full (not "mirror discounts" hand-waving) because each adds a novel piece (server-side search, detail+orders sheet, PIN flow, logo upload, form-not-list).
- **Type consistency:** `OptionGroup`/`OptionItem`/`SelectionMode` (Task 1) reused in Task 2; `Member`/`MemberOrder`, `Cashier`, `Settings` defined once and consumed by their pages. Money fields (`price_delta`, `subtotal`, `vat_percent`, `points_per_baht`) are THB numbers; display uses `toFixed(2)` / raw. 409 handling in members + cashiers clients.
- **Component reuse:** `LogoUpload` (Plan 2), `BottomSheet`/`SegmentedControl`/`Toggle`/`TextField`/`ListRow`/`Card`/`SearchBar`/`Spinner`/`EmptyState` (existing). `bind:open`/`bind:checked`/`bind:value` props match those components.

## Out of scope
Menu manager (Plan 4). Requires Plan 1 (auth+proxy) + Plan 2 (nav+components).
