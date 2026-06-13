<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';

	type Summary = { sales: number; orders: number };
	type TopMenu = { name: string; qty_sold: number; revenue: number };

	let summary = $state<Summary | null>(null);
	let top = $state<TopMenu[]>([]);
	let loading = $state(true);
	let errored = $state(false);

	const baht = (n: number) =>
		'฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	async function load() {
		loading = true;
		errored = false;
		try {
			const [sRes, tRes] = await Promise.all([
				fetch('/api/dashboard'),
				fetch('/api/dashboard/top-menus')
			]);
			if (!sRes.ok || !tRes.ok) throw new Error('dashboard request failed');
			const s = await sRes.json();
			const t = await tRes.json();
			summary = s.data;
			top = t.data ?? [];
		} catch {
			errored = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});
</script>

<NavBar title="Dashboard">
	{#snippet trailing()}
		<form method="POST" action="/logout">
			<button type="submit" class="font-semibold text-[var(--ios-blue)]">Sign Out</button>
		</form>
	{/snippet}
</NavBar>

<div class="space-y-4 px-4 pt-2 pb-6">
	{#if loading}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn’t load data" subtitle="Pull down or try again later." />
	{:else}
		<div class="grid grid-cols-2 gap-3">
			<Card>
				<p class="text-sm text-[var(--ios-label-secondary)]">Today’s Sales</p>
				<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{baht(summary?.sales ?? 0)}</p>
			</Card>
			<Card>
				<p class="text-sm text-[var(--ios-label-secondary)]">Orders</p>
				<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{summary?.orders ?? 0}</p>
			</Card>
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Top Items Today</p>
			{#if top.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No sales yet today.</p></Card>
			{:else}
				<Card padded={false}>
					{#each top as m, i (m.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < top.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{m.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{m.qty_sold} · {baht(m.revenue)}</span>
						</div>
					{/each}
				</Card>
			{/if}
		</div>
	{/if}
</div>
