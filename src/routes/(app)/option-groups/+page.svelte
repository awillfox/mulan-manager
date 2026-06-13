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
		listOptionGroups,
		createOptionGroup,
		updateOptionGroup,
		deleteOptionGroup,
		createOption,
		updateOption,
		deleteOption,
		SELECTION_MODES,
		type OptionGroup,
		type SelectionMode,
		type OptionItem
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
		try {
			groups = await listOptionGroups();
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}
	function openCreate() {
		editing = null;
		fName = '';
		fMode = 'single_required';
		rows = [{ name: '', delta: '' }];
		sheetOpen = true;
	}
	function openEdit(g: OptionGroup) {
		editing = g;
		fName = g.name;
		fMode = g.selection_mode;
		rows = g.options.map((o) => ({ id: o.id, name: o.name, delta: String(o.price_delta) }));
		if (rows.length === 0) rows = [{ name: '', delta: '' }];
		sheetOpen = true;
	}
	function addRow() {
		rows.push({ name: '', delta: '' });
	}
	function removeRow(i: number) {
		rows.splice(i, 1);
	}

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		saving = true;
		try {
			let groupId: number;
			if (editing) {
				await updateOptionGroup(editing.id, fName.trim(), fMode);
				groupId = editing.id;
			} else {
				const g = await createOptionGroup(fName.trim(), fMode);
				groupId = g.id;
			}

			const before = new Map<number, OptionItem>(
				(editing?.options ?? []).map((o) => [o.id!, o])
			);
			const keep = new Set<number>();
			for (let i = 0; i < rows.length; i++) {
				const r = rows[i];
				if (!r.name.trim()) continue;
				const payload = { name: r.name.trim(), price_delta: parseFloat(r.delta) || 0, sort_order: i };
				if (r.id) {
					keep.add(r.id);
					await updateOption(r.id, payload);
				} else {
					await createOption(groupId, payload);
				}
			}
			for (const id of before.keys()) if (!keep.has(id)) await deleteOption(id);

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
		if (!editing) return;
		if (!confirm('Delete this group? Isolated copies on menus are orphaned.')) return;
		try {
			await deleteOptionGroup(editing.id);
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
						<div class="text-sm text-[var(--ios-label-secondary)]">
							{modeLabel(g.selection_mode)} • {g.options.length} options
						</div>
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
			<SegmentedControl
				bind:value={fMode}
				options={SELECTION_MODES.map((m) => ({ label: m.label, value: m.value }))}
			/>
		</div>
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Options (name · ฿ delta)</span>
			<div class="space-y-2">
				{#each rows as row, i (i)}
					<div class="flex items-center gap-2">
						<input
							bind:value={row.name}
							placeholder="Option"
							class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
						/>
						<input
							bind:value={row.delta}
							inputmode="decimal"
							placeholder="0.00"
							class="h-11 w-24 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
						/>
						<button
							type="button"
							aria-label="Remove"
							onclick={() => removeRow(i)}
							class="px-2 text-[var(--ios-red)]">✕</button
						>
					</div>
				{/each}
			</div>
			<button type="button" onclick={addRow} class="mt-2 text-[var(--ios-blue)]">＋ Add option</button>
		</div>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editing}<Button variant="destructive" onclick={remove}>Delete</Button>{/if}
	</div>
</BottomSheet>
