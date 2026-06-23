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
		listMenus,
		createMenu,
		updateMenu,
		toggleMenu,
		deleteMenu,
		setMenuBaseOptions,
		setMenuGroups,
		type Menu
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
	let fName = $state('');
	let fVfd = $state('');
	let fPrice = $state('');
	let fCat = $state<number | null>(null);
	let fActive = $state(true);
	let fFav = $state(false);
	let baseRows = $state<{ name: string; price: string }[]>([]);
	let groupEntries = $state<GroupEntry[]>([]);
	let saving = $state(false);

	const baht = (n: number) => '฿' + n.toFixed(2);
	const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? 'Uncategorized';
	const hasBase = $derived(baseRows.some((r) => r.name.trim()));

	const sections = $derived.by(() => {
		const by = new Map<number | null, Menu[]>();
		for (const m of menus) {
			const k = m.category_id;
			if (!by.has(k)) by.set(k, []);
			by.get(k)!.push(m);
		}
		return [...by.entries()].map(([cid, items]) => ({ cid, name: catName(cid), items }));
	});

	async function refresh() {
		loading = true;
		try {
			[menus, cats, presets] = await Promise.all([listMenus(), listCategories(), listOptionGroups()]);
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editingId = null;
		fName = '';
		fVfd = '';
		fPrice = '';
		fCat = null;
		fActive = true;
		fFav = false;
		baseRows = [];
		groupEntries = [];
		sheetOpen = true;
	}
	function openEdit(m: Menu) {
		editingId = m.id;
		fName = m.name ?? '';
		fVfd = m.vfd_name ?? '';
		fPrice = String(m.price ?? '');
		fCat = m.category_id ?? null;
		fActive = m.active ?? true;
		fFav = m.favourite ?? false;
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
		try {
			await toggleMenu(m.id);
			await refresh();
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}

	// base options
	function addBase() {
		baseRows.push({ name: '', price: '' });
	}
	function removeBase(i: number) {
		baseRows.splice(i, 1);
	}

	// option groups
	function attachShared(presetId: number) {
		const p = presets.find((x) => x.id === presetId);
		if (!p) return;
		groupEntries.push({
			kind: 'shared',
			sourceId: p.id,
			name: p.name,
			selection_mode: p.selection_mode,
			options: p.options.map((o) => ({ name: o.name, delta: String(o.price_delta) }))
		});
	}
	function addOneOff() {
		groupEntries.push({
			kind: 'isolated',
			name: 'New group',
			selection_mode: 'single_required',
			options: [{ name: '', delta: '' }]
		});
	}
	function detach(i: number) {
		groupEntries.splice(i, 1);
	}
	function toggleCustomize(i: number) {
		const e = groupEntries[i];
		if (e.kind === 'shared')
			groupEntries[i] = {
				kind: 'isolated',
				sourceId: e.sourceId,
				name: e.name,
				selection_mode: e.selection_mode,
				options: e.options.map((o) => ({ ...o }))
			};
		else if (e.sourceId != null)
			groupEntries[i] = {
				kind: 'shared',
				sourceId: e.sourceId,
				name: e.name,
				selection_mode: e.selection_mode,
				options: e.options
			};
		// a one-off isolated (no sourceId) cannot revert to shared — leave as-is
	}
	function addOpt(i: number) {
		groupEntries[i].options.push({ name: '', delta: '' });
	}
	function removeOpt(i: number, k: number) {
		groupEntries[i].options.splice(k, 1);
	}

	const attachablePresets = $derived(
		presets.filter((p) => !groupEntries.some((e) => e.kind === 'shared' && e.sourceId === p.id))
	);

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		const price = parseFloat(fPrice) || 0;
		saving = true;
		try {
			let id = editingId;
			const input = {
				name: fName.trim(),
				price,
				category_id: fCat,
				vfd_name: fVfd.trim().slice(0, 20),
				favourite: fFav
			};
			if (id == null) {
				const m = await createMenu(input);
				id = m.id;
				// Promote to edit mode immediately: if a later step (base options /
				// option groups) fails, a Save retry must PATCH this menu, not create
				// a duplicate.
				editingId = m.id;
			} else await updateMenu(id, input);

			const base = baseRows
				.filter((r) => r.name.trim())
				.map((r) => ({ name: r.name.trim(), price: parseFloat(r.price) || 0 }));
			try {
				await setMenuBaseOptions(id, base);
			} catch (e) {
				throw new Error('Base options: ' + (e as Error).message);
			}
			try {
				await setMenuGroups(id, serializeMenuGroups(groupEntries));
			} catch (e) {
				throw new Error('Option groups: ' + (e as Error).message);
			}

			sheetOpen = false;
			await refresh();
			showToast('Saved');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}
	async function remove() {
		if (editingId == null) return;
		if (!confirm('Delete this item?')) return;
		try {
			await deleteMenu(editingId);
			sheetOpen = false;
			await refresh();
			showToast('Deleted');
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	$effect(() => {
		refresh();
	});
</script>

<NavBar title="Menu">
	{#snippet trailing()}
		<div class="flex items-center gap-3">
			<button type="button" onclick={() => (catSheet = true)} class="text-[var(--ios-blue)]"
				>Categories</button
			>
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
							<span class="font-medium text-[var(--ios-label)]">
								{#if m.favourite}<span class="text-[var(--ios-yellow,#ffcc00)]">★</span>{/if}{m.name}
							</span>
							{#snippet trailing()}
								<div class="flex items-center gap-3">
									<span class="text-[var(--ios-label-secondary)]">{baht(m.price)}</span>
									<button
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											toggle(m);
										}}
										class="rounded-full px-2 py-0.5 text-xs {m.active
											? 'bg-[var(--ios-green)]/15 text-[var(--ios-green)]'
											: 'bg-[var(--ios-fill)] text-[var(--ios-label-secondary)]'}"
									>
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
			{#if hasBase}
				<p class="mt-1 text-xs text-[var(--ios-label-tertiary)]">
					Ignored — base options set the price.
				</p>
			{/if}
		</div>
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Category</span>
			<select
				bind:value={fCat}
				class="h-11 w-full rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)]"
			>
				<option value={null}>Uncategorized</option>
				{#each cats as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</div>
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>
		<Card><Toggle label="★ Favourite (pinned under All at POS)" bind:checked={fFav} /></Card>

		<!-- Base options -->
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]"
				>Base options (name · ฿ absolute price)</span
			>
			<div class="space-y-2">
				{#each baseRows as row, i (i)}
					<div class="flex items-center gap-2">
						<input
							bind:value={row.name}
							placeholder="e.g. Iced"
							class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
						/>
						<input
							bind:value={row.price}
							inputmode="decimal"
							placeholder="50.00"
							class="h-11 w-24 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
						/>
						<button
							type="button"
							aria-label="Remove"
							onclick={() => removeBase(i)}
							class="px-2 text-[var(--ios-red)]">✕</button
						>
					</div>
				{/each}
			</div>
			<button type="button" onclick={addBase} class="mt-2 text-[var(--ios-blue)]"
				>＋ Add base option</button
			>
		</div>

		<!-- Option groups -->
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Option groups</span>
			<div class="space-y-3">
				{#each groupEntries as entry, i (i)}
					<Card>
						<div class="flex items-center justify-between">
							<span class="font-medium text-[var(--ios-label)]">{entry.name || 'Group'}</span>
							<button
								type="button"
								aria-label="Detach"
								onclick={() => detach(i)}
								class="text-[var(--ios-red)]">Remove</button
							>
						</div>
						<label class="mt-2 flex items-center justify-between">
							<span class="text-sm text-[var(--ios-label-secondary)]"
								>Customize (private to this item)</span
							>
							<input
								type="checkbox"
								checked={entry.kind === 'isolated'}
								onchange={() => toggleCustomize(i)}
							/>
						</label>
						{#if entry.kind === 'isolated'}
							<div class="mt-2 space-y-2">
								<input
									bind:value={entry.name}
									placeholder="Group name"
									class="h-10 w-full rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
								/>
								{#each entry.options as opt, k (k)}
									<div class="flex items-center gap-2">
										<input
											bind:value={opt.name}
											placeholder="Option"
											class="h-10 flex-1 rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
										/>
										<input
											bind:value={opt.delta}
											inputmode="decimal"
											placeholder="±0.00"
											class="h-10 w-20 rounded-lg bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
										/>
										<button
											type="button"
											aria-label="Remove option"
											onclick={() => removeOpt(i, k)}
											class="px-1 text-[var(--ios-red)]">✕</button
										>
									</div>
								{/each}
								<button type="button" onclick={() => addOpt(i)} class="text-[var(--ios-blue)]"
									>＋ Add option</button
								>
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
				<button
					type="button"
					onclick={() => (pickerOpen = true)}
					class="text-[var(--ios-blue)]"
					disabled={attachablePresets.length === 0}>＋ Attach preset</button
				>
				<button type="button" onclick={addOneOff} class="text-[var(--ios-blue)]"
					>＋ New one-off group</button
				>
			</div>
		</div>

		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editingId != null}<Button variant="destructive" onclick={remove}>Delete</Button>{/if}
	</div>
</BottomSheet>
