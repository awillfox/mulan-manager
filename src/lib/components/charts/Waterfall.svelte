<script lang="ts">
	import Card from '$lib/components/ios/Card.svelte';
	import { baht } from '$lib/format';
	let {
		gross,
		discount,
		net,
		subsidy
	}: { gross: number; discount: number; net: number; subsidy: number } = $props();
</script>

<Card>
	<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Sales breakdown</p>
	<div class="space-y-1 text-sm">
		<div class="flex justify-between">
			<span class="text-[var(--ios-label-secondary)]">Gross sales</span>
			<span class="font-mono text-[var(--ios-label)]" data-testid="wf-gross">{baht(gross)}</span>
		</div>
		<div class="flex justify-between">
			<span class="text-[var(--ios-label-secondary)]">− Discounts</span>
			<span class="font-mono text-[var(--ios-label)]">{baht(discount)}</span>
		</div>
		<div class="flex justify-between border-t border-[var(--ios-separator)] pt-1 font-semibold">
			<span>= Net sales</span>
			<span class="font-mono" data-testid="wf-net">{baht(net)}</span>
		</div>
		{#if subsidy > 0}
			<div class="flex justify-between">
				<span class="text-[var(--ios-label-secondary)]">+ Subsidy</span>
				<span class="font-mono text-[var(--ios-label)]">{baht(subsidy)}</span>
			</div>
		{/if}
	</div>
</Card>
