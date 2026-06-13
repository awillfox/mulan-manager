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
	import {
		listCashiers,
		createCashier,
		updateCashier,
		updateCashierPin,
		deleteCashier,
		type Cashier
	} from '$lib/api/cashiers';

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
		try {
			cashiers = await listCashiers();
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}
	function openCreate() {
		editing = null;
		fLogin = '';
		fName = '';
		fPin = '';
		fActive = true;
		newPin = '';
		sheetOpen = true;
	}
	function openEdit(c: Cashier) {
		editing = c;
		fLogin = c.login_id;
		fName = c.name;
		fActive = c.active;
		newPin = '';
		sheetOpen = true;
	}

	async function save() {
		if (!fName.trim()) return showToast('Name is required', 'error');
		saving = true;
		try {
			if (editing) await updateCashier(editing.id, fName.trim(), fActive);
			else {
				if (!fLogin.trim()) {
					saving = false;
					return showToast('Login ID is required', 'error');
				}
				if (fPin.length < 4) {
					saving = false;
					return showToast('PIN must be at least 4 digits', 'error');
				}
				await createCashier(fLogin.trim(), fName.trim(), fPin);
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
	async function changePin() {
		if (!editing) return;
		if (newPin.length < 4) return showToast('PIN must be at least 4 digits', 'error');
		try {
			await updateCashierPin(editing.id, newPin);
			newPin = '';
			showToast('PIN updated');
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	async function remove() {
		if (!editing) return;
		if (!confirm('Delete this cashier?')) return;
		try {
			await deleteCashier(editing.id);
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
						{#if !c.active}<span
								class="rounded-full bg-[var(--ios-fill)] px-2 py-0.5 text-xs text-[var(--ios-label-secondary)]"
								>Off</span
							>{/if}
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
			<TextField
				label="PIN (min 4 digits)"
				bind:value={fPin}
				inputmode="numeric"
				type="password"
				placeholder="••••"
			/>
		{/if}
		<Card><Toggle label="Active" bind:checked={fActive} /></Card>
		<Button onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
		{#if editing}
			<div class="space-y-2">
				<span class="block text-sm text-[var(--ios-label-secondary)]">Change PIN</span>
				<div class="flex gap-2">
					<input
						bind:value={newPin}
						inputmode="numeric"
						type="password"
						placeholder="new PIN"
						class="h-11 flex-1 rounded-xl bg-[var(--ios-fill)] px-3 text-[var(--ios-label)] outline-none"
					/>
					<Button variant="tinted" onclick={changePin}>Update</Button>
				</div>
			</div>
			<Button variant="destructive" onclick={remove}>Delete</Button>
		{/if}
	</div>
</BottomSheet>
