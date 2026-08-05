<script lang="ts">
	import NavBar from '$lib/components/ios/NavBar.svelte';
	import Card from '$lib/components/ios/Card.svelte';
	import Spinner from '$lib/components/ios/Spinner.svelte';
	import EmptyState from '$lib/components/ios/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ios/SegmentedControl.svelte';
	import { showToast } from '$lib/components/ios/toast.svelte';
	import { baht } from '$lib/format';
	import { presetRange, customRange, MAX_RANGE_DAYS } from '$lib/dashboard/range';
	import { listOrders, listAllOrders, type OrderRow } from '$lib/api/reports';
	import { exportOrdersXlsx } from '$lib/export/ordersXlsx';
	import { SvelteSet } from 'svelte/reactivity';

	const PAGE = 100;

	const statuses = [
		{ label: 'Paid', value: 'paid' },
		{ label: 'All', value: '' },
		{ label: 'Open', value: 'open' },
		{ label: 'Held', value: 'held' }
	];

	// The date pickers are the only range control; they open on the last 7 days,
	// which is also what the backend defaults to when from/to are omitted
	// (../mulan/internal/report/http/handler.go).
	const initial = presetRange('7d', new Date());

	let status = $state('paid');
	let customFrom = $state(initial.from);
	let customTo = $state(initial.to);
	let rangeError = $state('');

	let orders = $state<OrderRow[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadingMore = $state(false);
	let errored = $state(false);
	// Codes of orders whose detail row is open. Multiple stay open independently;
	// clicking another order does not collapse the others.
	const expanded = new SvelteSet<string>();

	// null while the picked window is unusable; the message explains why.
	const range = $derived(customRange(customFrom, customTo));

	function rangeMessage(): string {
		if (!customFrom || !customTo) return 'Pick a start and end date.';
		if (customFrom > customTo) return 'End date must be on or after the start date.';
		return `Range can't exceed ${MAX_RANGE_DAYS} days.`;
	}

	async function load(reset = true) {
		if (!range) {
			rangeError = rangeMessage();
			loading = false;
			loadingMore = false;
			return;
		}
		rangeError = '';
		if (reset) {
			loading = true;
			errored = false;
			expanded.clear();
		} else {
			loadingMore = true;
		}
		try {
			const { from, to } = range;
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
		if (expanded.has(code)) expanded.delete(code);
		else expanded.add(code);
	}

	function expandAll() {
		for (const o of orders) expanded.add(o.code);
	}

	function collapseAll() {
		expanded.clear();
	}

	let exporting = $state(false);

	async function exportXlsx() {
		if (!range) {
			showToast(rangeMessage(), 'error');
			return;
		}
		exporting = true;
		try {
			const { from, to } = range;
			const all = await listAllOrders({ from, to, status: status || undefined });
			const name = `orders-${from}-to-${to}${status ? '-' + status : ''}.xlsx`;
			await exportOrdersXlsx(all, name);
		} catch (e) {
			showToast((e as Error).message, 'error');
		} finally {
			exporting = false;
		}
	}

	const dt = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

	// Refetch whenever a filter changes. Read each dep explicitly so the effect
	// tracks them.
	$effect(() => {
		void status;
		void range;
		load(true);
	});
</script>

<NavBar title="Orders" />

<div class="space-y-4 px-4 pt-2 pb-6">
	<SegmentedControl options={statuses} bind:value={status} />
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
		{#if customFrom !== initial.from || customTo !== initial.to}
			<button
				class="text-[var(--ios-blue)]"
				onclick={() => {
					customFrom = initial.from;
					customTo = initial.to;
				}}>Last 7D</button
			>
		{/if}
	</div>
	{#if rangeError}
		<p class="px-1 text-sm text-[var(--ios-red)]">{rangeError}</p>
	{/if}

	{#if loading}
		<Spinner />
	{:else if errored}
		<EmptyState title="Couldn't load orders" subtitle="Try again later." />
	{:else if orders.length === 0}
		<EmptyState title="No orders" subtitle="No orders in this range." />
	{:else}
		<div class="flex items-center justify-between gap-3 px-1">
			<p class="text-xs text-[var(--ios-label-secondary)]">{orders.length} of {total}</p>
			<div class="flex items-center gap-4 text-sm font-medium">
				<button class="text-[var(--ios-blue)]" onclick={expandAll}>Expand all</button>
				<button
					class="text-[var(--ios-blue)] disabled:opacity-50"
					disabled={expanded.size === 0}
					onclick={collapseAll}>Collapse all</button
				>
				<button
					class="text-[var(--ios-blue)] disabled:opacity-50"
					disabled={exporting || orders.length === 0}
					onclick={exportXlsx}
				>
					{exporting ? 'Exporting…' : 'Export .xlsx'}
				</button>
			</div>
		</div>
		<Card padded={false}>
			<div class="overflow-x-auto">
				<table class="w-full min-w-[800px] text-sm">
					<thead>
						<tr
							class="border-b border-[var(--ios-separator)] text-left text-xs text-[var(--ios-label-secondary)]"
						>
							<th class="px-3 py-2 font-medium">Created</th>
							<th class="px-3 py-2 font-medium">Paid at</th>
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
								<td class="px-3 py-2 whitespace-nowrap text-[var(--ios-label)]"
									>{o.paid_at ? dt(o.paid_at) : '—'}</td
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
							{#if expanded.has(o.code)}
								<tr class="border-b border-[var(--ios-separator)] bg-[var(--ios-fill)]">
									<td colspan="9" class="px-4 py-3">
										<div class="space-y-2 text-sm">
											{#if o.member_name || o.member_phone}
												<p class="text-[var(--ios-label-secondary)]">
													Member: {o.member_name}
													{o.member_phone} · {o.points_earned} pts
												</p>
											{/if}
											{#each o.line_items as li, li_i (li_i)}
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
													{#each li.options as op, op_i (op_i)}
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
											{#each o.discounts as d, d_i (d_i)}
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
