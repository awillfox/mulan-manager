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
	import {
		listMembers,
		memberOrders,
		createMember,
		updateMember,
		deleteMember,
		type Member,
		type MemberOrder
	} from '$lib/api/members';

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
		try {
			members = await listMembers(query);
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}
	function openCreate() {
		selected = null;
		fPhone = '';
		fName = '';
		editOpen = true;
	}
	function openEdit(m: Member) {
		selected = m;
		fPhone = m.phone;
		fName = m.name;
		editOpen = true;
		detailOpen = false;
	}
	async function openDetail(m: Member) {
		selected = m;
		detailOpen = true;
		orders = [];
		try {
			orders = await memberOrders(m.id);
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	async function save() {
		if (!fPhone.trim()) return showToast('Phone is required', 'error');
		saving = true;
		try {
			if (selected) await updateMember(selected.id, fPhone.trim(), fName.trim());
			else await createMember(fPhone.trim(), fName.trim());
			editOpen = false;
			await refresh();
			showToast('Saved');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}
	async function remove() {
		if (!selected) return;
		if (!confirm('Delete this member? Past orders are kept.')) return;
		try {
			await deleteMember(selected.id);
			detailOpen = false;
			editOpen = false;
			await refresh();
			showToast('Deleted');
		} catch (e) {
			showToast((e as Error).message, 'error');
		}
	}
	$effect(() => {
		query;
		refresh();
	});
</script>

<NavBar title="Members">
	{#snippet trailing()}<Button variant="plain" onclick={openCreate}>＋ New</Button>{/snippet}
</NavBar>

<div class="space-y-3 px-4 pt-2 pb-6">
	<SearchBar bind:value={query} placeholder="Search name or phone" />
	{#if loading}
		<Spinner />
	{:else if members.length === 0}
		<EmptyState
			title={query ? 'No matches' : 'No members'}
			subtitle={query ? 'Try another search.' : 'Add your first member.'}
		/>
	{:else}
		<Card padded={false}>
			{#each members as m, i (m.id)}
				<ListRow divider={i < members.length - 1} onclick={() => openDetail(m)}>
					<div>
						<div class="font-medium text-[var(--ios-label)]">{m.name || '(no name)'}</div>
						<div class="text-sm text-[var(--ios-label-secondary)]">{m.phone}</div>
					</div>
					{#snippet trailing()}<span class="text-[var(--ios-label-secondary)]">{m.points} pts</span
						>{/snippet}
				</ListRow>
			{/each}
		</Card>
	{/if}
</div>

<BottomSheet bind:open={detailOpen} title={selected?.name || selected?.phone}>
	<div class="space-y-4 pb-6">
		<Card
			><div class="flex items-center justify-between">
				<span class="text-[var(--ios-label-secondary)]">Points</span><span
					class="text-xl font-bold text-[var(--ios-label)]">{selected?.points ?? 0}</span
				>
			</div></Card
		>
		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Order history</p>
			{#if orders.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No paid orders yet.</p></Card>
			{:else}
				<Card padded={false}>
					{#each orders as o, i (o.code)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < orders.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{o.code}</span>
							<span class="text-[var(--ios-label-secondary)]"
								>+{o.points_earned} · {baht(o.subtotal)}</span
							>
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
