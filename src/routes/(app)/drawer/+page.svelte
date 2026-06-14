<script lang="ts">
	import { onMount } from 'svelte';
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { getDenominations, setDenominations } from '$lib/api/cashdrawer';

	// Denominations in satang (string keys match the backend), largest first.
	const DENOMS: { satang: string; label: string }[] = [
		{ satang: '100000', label: '฿1000' },
		{ satang: '50000', label: '฿500' },
		{ satang: '10000', label: '฿100' },
		{ satang: '5000', label: '฿50' },
		{ satang: '2000', label: '฿20' },
		{ satang: '1000', label: '฿10' },
		{ satang: '500', label: '฿5' },
		{ satang: '200', label: '฿2' },
		{ satang: '100', label: '฿1' }
	];

	let counts = $state<Record<string, number>>({});
	let loading = $state(true);
	let saving = $state(false);

	const total = $derived(
		DENOMS.reduce((sum, d) => sum + Number(d.satang) * (counts[d.satang] || 0), 0) / 100
	);

	const fmt = (n: number) => '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	async function refresh() {
		loading = true;
		try {
			const d = await getDenominations();
			const next: Record<string, number> = {};
			for (const { satang } of DENOMS) next[satang] = (d.counts && d.counts[satang]) || 0;
			counts = next;
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
		}
	}

	function bump(satang: string, delta: number) {
		counts[satang] = Math.max(0, (counts[satang] || 0) + delta);
	}

	function setCount(satang: string, v: string) {
		counts[satang] = Math.max(0, parseInt(v) || 0);
	}

	async function save() {
		saving = true;
		try {
			const d = await setDenominations(counts);
			const next: Record<string, number> = {};
			for (const { satang } of DENOMS) next[satang] = (d.counts && d.counts[satang]) || 0;
			counts = next;
			showToast('Cash drawer updated');
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			saving = false;
		}
	}

	onMount(refresh);
</script>

<NavBar title="Cash Drawer" />

<div class="space-y-5 px-4 pt-2 pb-28">
	<p class="px-1 text-sm text-[var(--ios-label-secondary)]">
		Count the bills and coins in the drawer and set how many of each are present.
	</p>

	{#if loading}
		<div class="flex justify-center py-16"><Spinner /></div>
	{:else}
		<Card padded={false}>
			{#each DENOMS as d, i (d.satang)}
				<div
					class="flex items-center justify-between gap-3 px-4 py-3 {i < DENOMS.length - 1
						? 'border-b border-[var(--ios-separator)]'
						: ''}"
				>
					<span class="w-20 font-medium text-[var(--ios-label)]">{d.label}</span>
					<div class="flex flex-1 items-center justify-end gap-3">
						<button
							type="button"
							aria-label="decrease"
							onclick={() => bump(d.satang, -1)}
							class="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ios-fill)] text-2xl text-[var(--ios-label)] active:opacity-60"
						>−</button>
						<input
							type="number"
							min="0"
							inputmode="numeric"
							value={counts[d.satang] || 0}
							oninput={(e) => setCount(d.satang, e.currentTarget.value)}
							class="w-20 rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-bg)] py-2 text-center text-lg font-semibold tabular-nums text-[var(--ios-label)]"
						/>
						<button
							type="button"
							aria-label="increase"
							onclick={() => bump(d.satang, 1)}
							class="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--ios-fill)] text-2xl text-[var(--ios-label)] active:opacity-60"
						>+</button>
					</div>
				</div>
			{/each}
		</Card>

		<div class="flex items-center justify-between px-1">
			<span class="text-sm text-[var(--ios-label-secondary)]">Total in drawer</span>
			<span class="text-xl font-semibold tabular-nums text-[var(--ios-label)]">{fmt(total)}</span>
		</div>

		<button
			type="button"
			onclick={save}
			disabled={saving}
			class="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--ios-blue)] px-5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
		>
			{saving ? 'Saving…' : 'Save drawer'}
		</button>
	{/if}
</div>
