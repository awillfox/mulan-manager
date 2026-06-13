<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import SearchBar from '$lib/components/ios/SearchBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import ListRow from '$lib/components/ios/ListRow.svelte';
	import Button from '$lib/components/ios/Button.svelte';
	import Toggle from '$lib/components/ios/Toggle.svelte';
	import TextField from '$lib/components/ios/TextField.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import BottomSheet from '$lib/components/ios/BottomSheet.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import {
		listDiscounts,
		createDiscount,
		updateDiscount,
		deleteDiscount,
		type Discount,
		type DiscountType
	} from '$lib/api/discounts';

	let discounts = $state<Discount[]>([]);
	let loading = $state(true);
	let query = $state('');

	let sheetOpen = $state(false);
	let editingId = $state<number | null>(null);
	let fName = $state('');
	let fType = $state<DiscountType>('fixed');
	let fValue = $state('');
	let fActive = $state(true);
	let fSubsidy = $state(false);
	let saving = $state(false);

	const filtered = $derived(
		discounts.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
	);

	const fmtValue = (d: Discount) =>
		d.discount_type === 'percent' ? `${d.value}%` : `฿${d.value.toFixed(2)}`;

	async function refresh() {
		loading = true;
		try {
			discounts = await listDiscounts();
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editingId = null;
		fName = '';
		fType = 'fixed';
		fValue = '';
		fActive = true;
		fSubsidy = false;
		sheetOpen = true;
	}

	function openEdit(d: Discount) {
		editingId = d.id;
		fName = d.name;
		fType = d.discount_type;
		fValue = String(d.value);
		fActive = d.active;
		fSubsidy = d.is_subsidy;
		sheetOpen = true;
	}

	async function save() {
		const value = parseFloat(fValue);
		if (!fName.trim()) return showToast('Name is required', 'error');
		if (Number.isNaN(value) || value < 0) return showToast('Enter a valid amount', 'error');
		if (fType === 'percent' && value > 100) return showToast('Percent cannot exceed 100', 'error');
		saving = true;
		const input = {
			name: fName.trim(),
			discount_type: fType,
			value,
			active: fActive,
			is_subsidy: fSubsidy
		};
		try {
			if (editingId === null) await createDiscount(input);
			else await updateDiscount(editingId, input);
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
		if (editingId === null) return;
		if (!confirm('Delete this discount?')) return;
		try {
			await deleteDiscount(editingId);
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

<NavBar title="Discounts">
	{#snippet trailing()}
		<Button variant="plain" onclick={openCreate}>＋ New</Button>
	{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	<SearchBar bind:value={query} placeholder="Search discounts" />

	{#if loading}
		<Spinner />
	{:else if filtered.length === 0}
		<EmptyState
			title={query ? 'No matches' : 'No discounts yet'}
			subtitle={query ? 'Try a different search.' : 'Create your first preset discount.'}
		>
			{#snippet action()}
				{#if !query}<Button onclick={openCreate}>Create Discount</Button>{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<Card padded={false}>
			{#each filtered as d, i (d.id)}
				<ListRow divider={i < filtered.length - 1} onclick={() => openEdit(d)}>
					<div class="flex items-center gap-2">
						<span class="font-medium text-[var(--ios-label)]">{d.name}</span>
						{#if !d.active}
							<span class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-label-secondary)]">Off</span>
						{/if}
						{#if d.is_subsidy}
							<span class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-blue)]">Subsidy</span>
						{/if}
					</div>
					{#snippet trailing()}
						<span class="text-[var(--ios-label-secondary)]">{fmtValue(d)}</span>
					{/snippet}
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={sheetOpen} title={editingId === null ? 'New Discount' : 'Edit Discount'}>
	<div class="space-y-4 pb-6">
		<TextField label="Name" bind:value={fName} placeholder="e.g. Staff 10%" />
		<div>
			<span class="mb-1 block text-sm text-[var(--ios-label-secondary)]">Type</span>
			<SegmentedControl
				bind:value={fType}
				options={[
					{ label: 'Fixed (฿)', value: 'fixed' },
					{ label: 'Percent (%)', value: 'percent' }
				]}
			/>
		</div>
		<TextField
			label={fType === 'percent' ? 'Percent off' : 'Baht off'}
			bind:value={fValue}
			inputmode="decimal"
			placeholder={fType === 'percent' ? '10' : '50.00'}
		/>
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>
		<Card><Toggle label="Subsidy (sponsor-covered)" bind:checked={fSubsidy} /></Card>

		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editingId !== null}
			<Button variant="destructive" onclick={remove}>Delete</Button>
		{/if}
	</div>
</BottomSheet>
