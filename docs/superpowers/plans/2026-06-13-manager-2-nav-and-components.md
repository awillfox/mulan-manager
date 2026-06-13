# Manager Build-out Plan 2 — Navigation + Shared Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> REQUIRED for every `.svelte` file: run the Svelte MCP `svelte-autofixer` (ToolSearch `select:mcp__svelte__svelte-autofixer`) until clean. Svelte 5 runes. No playground link.

**Goal:** Switch the app shell to 4 tabs (Dashboard · Menu · Members · More), add the `/more` grouped-list page, and build the reusable components the manager pages need (`Picker`, `LogoUpload`, plus a repeatable-rows pattern).

**Architecture:** Extend the existing `(app)` shell + iOS component library (`src/lib/components/ios/`). Discounts moves under More (page stays at `/discounts`). New components follow the existing primitives' conventions (CSS vars, `$props`, snippets, `bind:`).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Tailwind v4. Repo `/home/nate/Dev/mulan-manager` (branch `main`).

**Reference components:** `src/lib/components/ios/BottomSheet.svelte`, `BottomTabBar.svelte`, `ListRow.svelte`, `Card.svelte`, `SegmentedControl.svelte`, `Toggle.svelte`.

---

### Task 1: 4-tab BottomTabBar + Menu/Members tab targets

**Files:**
- Modify: `src/routes/(app)/+layout.svelte`

- [ ] **Step 1: Update the tabs array**

In `src/routes/(app)/+layout.svelte`, replace the `tabs` array with the 4 destinations:
```js
const tabs = [
	{ href: '/', label: 'Dashboard', icon: '📊' },
	{ href: '/menu', label: 'Menu', icon: '☕' },
	{ href: '/members', label: 'Members', icon: '👤' },
	{ href: '/more', label: 'More', icon: '⋯' }
];
```
(`/menu`, `/members`, `/more` pages are created in this and later plans; until then they 404 — that's fine, verified at the end.)

- [ ] **Step 2: Verify the active-tab highlight handles sub-routes**

The `BottomTabBar` marks a tab active when `page.url.pathname === tab.href`. For `/more`, deep pages (`/cashiers`, `/settings`) won't keep "More" highlighted — acceptable (they're reached via More and have a back affordance). No change needed; note it.

- [ ] **Step 3: autofixer + check + commit**

Run `svelte-autofixer` on `+layout.svelte`; then `cd /home/nate/Dev/mulan-manager && npm run check`. Commit:
```bash
git add "src/routes/(app)/+layout.svelte"
git commit -m "feat: 4-tab nav (dashboard/menu/members/more)"
```

---

### Task 2: `/more` grouped-list page

**Files:**
- Create: `src/routes/(app)/more/+page.svelte`

- [ ] **Step 1: Write the page**

Create `src/routes/(app)/more/+page.svelte`:
```svelte
<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';

	const groups = [
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
				{ href: '/settings', label: 'Settings', icon: '⚙' }
			]
		}
	];
</script>

<NavBar title="More" />

<div class="space-y-6 px-4 pt-2 pb-6">
	{#each groups as group (group.title)}
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">{group.title}</p>
			<Card padded={false}>
				{#each group.items as item, i (item.href)}
					<a
						href={item.href}
						class="flex min-h-11 items-center justify-between px-4 py-3 active:bg-[var(--ios-fill)] {i <
						group.items.length - 1
							? 'border-b border-[var(--ios-separator)]'
							: ''}"
					>
						<span class="flex items-center gap-3 text-[var(--ios-label)]">
							<span class="text-lg">{item.icon}</span>{item.label}
						</span>
						<span class="text-[var(--ios-label-tertiary)]">›</span>
					</a>
				{/each}
			</Card>
		</div>
	{/each}
</div>
```

- [ ] **Step 2: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add "src/routes/(app)/more/"
git commit -m "feat: More page (catalog + staff/shop nav)"
```

---

### Task 3: `Picker` component (iOS selection sheet)

**Files:**
- Create: `src/lib/components/ios/Picker.svelte`
- Test: (manual via consuming pages; no unit test — presentational)

Used for: category selection, attaching a shared option-group, choosing where a sheet beats a segmented control.

- [ ] **Step 1: Write the component**

Create `src/lib/components/ios/Picker.svelte`:
```svelte
<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	type Option = { label: string; value: string | number | null };
	let {
		open = $bindable(false),
		title = 'Select',
		options,
		value = $bindable(),
		onselect
	}: {
		open?: boolean;
		title?: string;
		options: Option[];
		value?: string | number | null;
		onselect?: (v: string | number | null) => void;
	} = $props();

	function pick(v: string | number | null) {
		value = v;
		onselect?.(v);
		open = false;
	}
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') open = false; }} />

{#if open}
	<div class="fixed inset-0 z-50">
		<button
			type="button"
			aria-label="Close"
			class="absolute inset-0 bg-black/40"
			onclick={() => (open = false)}
			transition:fade={{ duration: 200 }}
		></button>
		<div
			class="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[20px] bg-[var(--ios-grouped-bg)] pb-[env(safe-area-inset-bottom)]"
			transition:fly={{ y: 500, duration: 300 }}
			role="dialog"
			aria-modal="true"
		>
			<div class="sticky top-0 flex items-center justify-center pt-2 pb-1">
				<div class="h-1.5 w-9 rounded-full bg-[var(--ios-label-tertiary)]"></div>
			</div>
			<p class="px-5 pb-2 text-xl font-bold text-[var(--ios-label)]">{title}</p>
			<div class="px-4 pb-4">
				{#each options as opt (String(opt.value))}
					<button
						type="button"
						onclick={() => pick(opt.value)}
						class="flex min-h-11 w-full items-center justify-between border-b border-[var(--ios-separator)] px-2 py-3 text-left last:border-0"
					>
						<span class="text-[var(--ios-label)]">{opt.label}</span>
						{#if value === opt.value}<span class="text-[var(--ios-blue)]">✓</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
```

- [ ] **Step 2: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add src/lib/components/ios/Picker.svelte
git commit -m "feat: iOS Picker selection sheet"
```

---

### Task 4: `LogoUpload` component

**Files:**
- Create: `src/lib/components/ios/LogoUpload.svelte`

- [ ] **Step 1: Write the component**

Create `src/lib/components/ios/LogoUpload.svelte`. Emits the chosen `File` via `onpick`; parent does the `PUT` (multipart) through the proxy. Shows the current logo (cache-busted) + a remove action.
```svelte
<script lang="ts">
	import Button from './Button.svelte';
	let {
		logoUrl = '/api/settings/logo',
		version = 0,
		onpick,
		onremove
	}: {
		logoUrl?: string;
		version?: number;
		onpick?: (file: File) => void;
		onremove?: () => void;
	} = $props();

	let fileInput = $state<HTMLInputElement | null>(null);
	let failed = $state(false);

	function choose() {
		fileInput?.click();
	}
	function onchange(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (f) onpick?.(f);
	}
</script>

<div class="flex items-center gap-4">
	<div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-[var(--ios-fill)]">
		{#if failed}
			<span class="text-xs text-[var(--ios-label-tertiary)]">No logo</span>
		{:else}
			<img
				src={`${logoUrl}?v=${version}`}
				alt="Shop logo"
				class="h-full w-full object-contain"
				onerror={() => (failed = true)}
			/>
		{/if}
	</div>
	<div class="flex gap-2">
		<Button variant="tinted" onclick={choose}>Upload</Button>
		<Button variant="plain" onclick={() => onremove?.()}>Remove</Button>
	</div>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
		class="hidden"
		onchange={onchange}
	/>
</div>
```

- [ ] **Step 2: autofixer + check + commit**

`svelte-autofixer` until clean; `npm run check`. Commit:
```bash
git add src/lib/components/ios/LogoUpload.svelte
git commit -m "feat: iOS LogoUpload component"
```

---

### Task 5: Repeatable-rows pattern (documented, not a component)

**Files:** none (decision recorded for Plans 3–4).

- [ ] **Step 1: Record the pattern**

Repeatable editors (option rows, base-option rows) are implemented INLINE per page with a `$state` array + add/remove, NOT a generic component — the row shapes differ (option = `{name, price_delta}`, base = `{name, price}`) and inlining keeps each page's editor self-contained and easy to bind. Canonical inline shape (used in Plans 3–4):
```svelte
<script lang="ts">
	let rows = $state<{ name: string; price: string }[]>([]);
	function addRow() { rows.push({ name: '', price: '' }); }
	function removeRow(i: number) { rows.splice(i, 1); }
</script>

{#each rows as row, i (i)}
	<div class="flex items-center gap-2">
		<input bind:value={row.name} placeholder="Name" class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3" />
		<input bind:value={row.price} inputmode="decimal" placeholder="0.00" class="h-11 w-24 rounded-xl bg-[var(--ios-fill)] px-3" />
		<button type="button" onclick={() => removeRow(i)} aria-label="Remove" class="px-2 text-[var(--ios-red)]">✕</button>
	</div>
{/each}
```
No code committed in this task — it's a reference the page tasks copy and adapt. (Keying by index `i` is intentional: rows are positional and we never reorder, only add/remove at the end or by explicit splice.)

---

### Task 6: Verify nav end-to-end

**Files:** none (verification).

- [ ] **Step 1: Build + manual nav check**

Run `cd /home/nate/Dev/mulan-manager && npm run build`. Then with a backend running + logged in (`npm run dev`), confirm: bottom bar shows 4 tabs; tapping **More** shows the grouped list; tapping **Discounts** inside More loads the existing discounts page; **Menu**/**Members** tabs 404 for now (their pages come in Plans 3–4). Note results.

- [ ] **Step 2: (no commit — verification only)**

---

## Self-Review (completed)

- **Spec §4 nav:** 4 tabs (Task 1) + `/more` grouped list with Catalog/Staff&Shop (Task 2) ✓. §6 components: `Picker` (Task 3), `LogoUpload` (Task 4), repeatable-rows pattern (Task 5), `MoreList` realized as the `/more` page directly (Task 2 — no separate component needed, YAGNI) ✓.
- **No placeholders:** every component has full code. Task 5 is an intentional pattern-record (no file), clearly marked.
- **Consistency:** components use the same CSS-var tokens, `$bindable`, snippet/transition conventions as the existing primitives (`BottomSheet` Escape handling mirrored in `Picker`). `Button` variants (`tinted`,`plain`) referenced in `LogoUpload` exist.
- **Note:** the `/menu` and `/members` tab targets are created in Plans 3–4; flagged in Task 1/6.

## Out of scope
The pages themselves (Plans 3–4). This plan delivers the shell + reusable parts.
