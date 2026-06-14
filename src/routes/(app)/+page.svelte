<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import Waterfall from '$lib/components/charts/Waterfall.svelte';
	import Heatmap from '$lib/components/charts/Heatmap.svelte';
	import SalesChart from '$lib/components/charts/SalesChart.svelte';
	import Donut from '$lib/components/charts/Donut.svelte';
	import { baht } from '$lib/format';
	import { presetRange, type Preset } from '$lib/dashboard/range';
	import { deltaPct, deltaLabel } from '$lib/dashboard/delta';
	import { loadDashboard, type DashboardData } from '$lib/dashboard/api';

	const presets = [
		{ label: 'Today', value: 'today' },
		{ label: '7D', value: '7d' },
		{ label: '30D', value: '30d' },
		{ label: '90D', value: '90d' }
	];

	let preset = $state('7d');
	let data = $state<DashboardData | null>(null);
	let loading = $state(true);
	let errored = $state(false);

	async function load(p: string) {
		loading = true;
		errored = false;
		try {
			data = await loadDashboard(presetRange(p as Preset, new Date()));
		} catch {
			errored = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load(preset);
	});

	const cur = $derived(data?.compare.current);
	const prev = $derived(data?.compare.previous);
</script>

<NavBar title="Dashboard" />

<div class="space-y-4 px-4 pt-2 pb-6">
	<SegmentedControl options={presets} bind:value={preset} />

	{#if loading && !data}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn't load data" subtitle="Try again later." />
	{:else if data && cur && prev}
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [{ label: 'Net sales', val: baht(cur.net_sales), d: deltaPct(cur.net_sales, prev.net_sales) }, { label: 'Orders', val: String(cur.orders), d: deltaPct(cur.orders, prev.orders) }, { label: 'Items', val: String(cur.items), d: deltaPct(cur.items, prev.items) }, { label: 'Avg ticket', val: baht(cur.avg_ticket), d: deltaPct(cur.avg_ticket, prev.avg_ticket) }] as kpi (kpi.label)}
				<Card>
					<p class="text-sm text-[var(--ios-label-secondary)]">{kpi.label}</p>
					<p class="mt-1 text-2xl font-bold text-[var(--ios-label)]">{kpi.val}</p>
					<p class="mt-0.5 text-xs text-[var(--ios-label-tertiary)]">{deltaLabel(kpi.d)}</p>
				</Card>
			{/each}
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Waterfall
				gross={cur.gross}
				discount={cur.discount}
				net={cur.net_sales}
				subsidy={cur.subsidy}
			/>
			<Card>
				<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Sales over time</p>
				{#if data.salesByDay.length === 0}
					<p class="text-[var(--ios-label-secondary)]">No sales in this period.</p>
				{:else}
					<SalesChart points={data.salesByDay} />
				{/if}
			</Card>
		</div>

		<div class="grid gap-4 md:grid-cols-2">
			<Card>
				<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Item mix</p>
				{#if data.topMenus.length === 0}
					<p class="text-[var(--ios-label-secondary)]">No sales yet.</p>
				{:else}
					<Donut items={data.topMenus} />
				{/if}
			</Card>
			<Heatmap cells={data.heatmap} />
		</div>

		<div>
			<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">Top items</p>
			{#if data.topMenus.length === 0}
				<Card><p class="text-[var(--ios-label-secondary)]">No sales yet.</p></Card>
			{:else}
				<Card padded={false}>
					{#each data.topMenus as m, i (m.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < data.topMenus.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{m.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{m.qty_sold} · {baht(m.revenue)}</span
							>
						</div>
					{/each}
				</Card>
			{/if}
		</div>

		{#if data.subsidies.length > 0}
			<div>
				<p class="mb-2 px-1 text-sm font-medium text-[var(--ios-label-secondary)]">
					Subsidy by program
				</p>
				<Card padded={false}>
					{#each data.subsidies as s, i (s.name)}
						<div
							class="flex items-center justify-between px-4 py-3 {i < data.subsidies.length - 1
								? 'border-b border-[var(--ios-separator)]'
								: ''}"
						>
							<span class="text-[var(--ios-label)]">{s.name}</span>
							<span class="text-[var(--ios-label-secondary)]">{baht(s.amount)}</span>
						</div>
					{/each}
				</Card>
			</div>
		{/if}
	{/if}
</div>
