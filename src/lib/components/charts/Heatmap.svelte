<script lang="ts">
	import Card from '$lib/components/ios/Card.svelte';
	import type { HeatmapCell } from '$lib/dashboard/types';

	let { cells }: { cells: HeatmapCell[] } = $props();
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const hours = Array.from({ length: 24 }, (_, h) => h);
	const max = $derived(Math.max(1, ...cells.map((c) => c.revenue)));

	function rev(dow: number, hour: number): number {
		return cells.find((c) => c.dow === dow && c.hour === hour)?.revenue ?? 0;
	}
</script>

<Card>
	<p class="mb-2 text-sm font-medium text-[var(--ios-label-secondary)]">Busy times</p>
	<div class="overflow-x-auto">
		<div class="grid gap-0.5" style="grid-template-columns: 30px repeat(24, 1fr); min-width: 520px">
			<div></div>
			{#each hours as h (h)}
				<div class="text-center text-[8px] text-[var(--ios-label-tertiary)]">
					{h % 6 === 0 ? h : ''}
				</div>
			{/each}
			{#each days as label, dow (dow)}
				<div class="text-[9px] leading-4 text-[var(--ios-label-secondary)]">{label}</div>
				{#each hours as h (h)}
					{@const v = rev(dow, h)}
					<div
						class="aspect-square rounded-[2px]"
						style="background-color: color-mix(in srgb, var(--ios-blue) {Math.round(
							(v / max) * 100
						)}%, transparent)"
						data-testid="cell-{dow}-{h}"
						title="{label} {h}:00 · {v}"
					></div>
				{/each}
			{/each}
		</div>
	</div>
</Card>
