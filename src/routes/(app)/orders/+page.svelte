<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { baht } from '$lib/format';
	import { presetRange, type Preset } from '$lib/dashboard/range';
	import { listOrders, type OrderRow } from '$lib/api/reports';

	const PAGE = 100;

	const presets = [
		{ label: 'Today', value: 'today' },
		{ label: '7D', value: '7d' },
		{ label: '30D', value: '30d' },
		{ label: '90D', value: '90d' }
	];
	const statuses = [
		{ label: 'Paid', value: 'paid' },
		{ label: 'All', value: '' },
		{ label: 'Open', value: 'open' },
		{ label: 'Held', value: 'held' }
	];

	let preset = $state('7d');
	let status = $state('paid');
	let customFrom = $state('');
	let customTo = $state('');

	let orders = $state<OrderRow[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errored = $state(false);
	let expanded = $state<string | null>(null);

	function range(): { from: string; to: string } {
		if (customFrom && customTo) return { from: customFrom, to: customTo };
		return presetRange(preset as Preset, new Date());
	}

	async function load(reset = true) {
		if (reset) {
			loading = true;
			errored = false;
			expanded = null;
		} else {
			loadingMore = true;
		}
		try {
			const { from, to } = range();
			const offset = reset ? 0 : orders.length;
			const page = await listOrders({ from, to, status: status || undefined, limit: PAGE, offset });
			orders = reset ? page.orders : [...orders, ...page.orders];
			total = page.total;
		} catch (e) {
			if (reset) errored = true;
			showToast((e as Error).message, 'error');
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function toggle(code: string) {
		expanded = expanded === code ? null : code;
	}

	const dt = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

	// Refetch whenever any filter changes. Read each dep explicitly so the effect
	// tracks them. customFrom/customTo only take effect once BOTH are set.
	$effect(() => {
		void preset;
		void status;
		void customFrom;
		void customTo;
		load(true);
	});
</script>

<NavBar title="Orders" />

<div class="space-y-4 px-4 pt-2 pb-6">
	<SegmentedControl options={statuses} bind:value={status} />
	<SegmentedControl options={presets} bind:value={preset} />
	<div class="flex items-center gap-2 text-sm">
		<input
			type="date"
			bind:value={customFrom}
			class="rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-1 text-[var(--ios-label)]"
		/>
		<span class="text-[var(--ios-label-secondary)]">→</span>
		<input
			type="date"
			bind:value={customTo}
			class="rounded-lg border border-[var(--ios-separator)] bg-[var(--ios-card)] px-2 py-1 text-[var(--ios-label)]"
		/>
		{#if customFrom || customTo}
			<button
				class="text-[var(--ios-blue)]"
				onclick={() => {
					customFrom = '';
					customTo = '';
				}}>Clear</button
			>
		{/if}
	</div>

	{#if loading}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn't load orders" subtitle="Try again later." />
	{:else if orders.length === 0}
		<EmptyState title="No orders" subtitle="No orders in this range." />
	{:else}
		<p class="px-1 text-xs text-[var(--ios-label-secondary)]">{orders.length} of {total}</p>
		<Card padded={false}>
			<div class="overflow-x-auto">
				<table class="w-full min-w-[680px] text-sm">
					<thead>
						<tr
							class="border-b border-[var(--ios-separator)] text-left text-xs text-[var(--ios-label-secondary)]"
						>
							<th class="px-3 py-2 font-medium">Date</th>
							<th class="px-3 py-2 font-medium">Code</th>
							<th class="px-3 py-2 font-medium">Status</th>
							<th class="px-3 py-2 text-right font-medium">Items</th>
							<th class="px-3 py-2 text-right font-medium">Gross</th>
							<th class="px-3 py-2 text-right font-medium">Discount</th>
							<th class="px-3 py-2 text-right font-medium">Subsidy</th>
							<th class="px-3 py-2 text-right font-medium">Net</th>
						</tr>
					</thead>
					<tbody>
						{#each orders as o (o.code)}
							<tr
								class="cursor-pointer border-b border-[var(--ios-separator)] hover:bg-[var(--ios-fill)]"
								onclick={() => toggle(o.code)}
							>
								<td class="px-3 py-2 whitespace-nowrap text-[var(--ios-label)]"
									>{dt(o.created_at)}</td
								>
								<td class="px-3 py-2 font-mono text-[var(--ios-label)]">{o.code}</td>
								<td class="px-3 py-2 text-[var(--ios-label-secondary)]">{o.status}</td>
								<td class="px-3 py-2 text-right text-[var(--ios-label)]">{o.qty}</td>
								<td class="px-3 py-2 text-right font-mono text-[var(--ios-label)]"
									>{baht(o.gross)}</td
								>
								<td class="px-3 py-2 text-right font-mono text-[var(--ios-label-secondary)]"
									>{baht(o.discount)}</td
								>
								<td class="px-3 py-2 text-right font-mono text-[var(--ios-label-secondary)]"
									>{baht(o.subsidy)}</td
								>
								<td class="px-3 py-2 text-right font-mono font-semibold text-[var(--ios-label)]"
									>{baht(o.net)}</td
								>
							</tr>
							{#if expanded === o.code}
								<tr class="border-b border-[var(--ios-separator)] bg-[var(--ios-fill)]">
									<td colspan="8" class="px-4 py-3">
										<div class="space-y-2 text-sm">
											{#if o.member_name || o.member_phone}
												<p class="text-[var(--ios-label-secondary)]">
													Member: {o.member_name}
													{o.member_phone} · {o.points_earned} pts
												</p>
											{/if}
											{#each o.line_items as li (li.name + li.base_option_name)}
												<div>
													<div class="flex justify-between">
														<span class="text-[var(--ios-label)]">
															{li.qty}× {li.name}{li.base_option_name
																? ` (${li.base_option_name})`
																: ''}
														</span>
														<span class="font-mono text-[var(--ios-label-secondary)]"
															>{baht(li.price)}</span
														>
													</div>
													{#each li.options as op (op.name)}
														<div
															class="flex justify-between pl-4 text-[var(--ios-label-secondary)]"
														>
															<span>+ {op.name}</span><span class="font-mono"
																>{baht(op.price_delta)}</span
															>
														</div>
													{/each}
												</div>
											{/each}
											{#each o.discounts as d (d.name)}
												<div class="flex justify-between text-[var(--ios-label-secondary)]">
													<span>{d.is_subsidy ? 'Subsidy' : 'Discount'}: {d.name}</span>
													<span class="font-mono">{baht(d.amount)}</span>
												</div>
											{/each}
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
		{#if orders.length < total}
			<button
				class="w-full rounded-xl bg-[var(--ios-fill)] py-3 text-sm font-medium text-[var(--ios-blue)] disabled:opacity-50"
				disabled={loadingMore}
				onclick={() => load(false)}
			>
				{loadingMore ? 'Loading…' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>
