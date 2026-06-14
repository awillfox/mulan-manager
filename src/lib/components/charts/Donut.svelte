<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Chart } from 'chart.js';
	import { ensureChart, PALETTE } from '$lib/charts/chartTheme';
	import { topNWithOther } from '$lib/charts/donutData';
	import type { TopMenu } from '$lib/dashboard/types';

	let { items }: { items: TopMenu[] } = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: Chart | undefined;

	function chartData() {
		const slices = topNWithOther(items, 6);
		return {
			labels: slices.map((s) => s.name),
			datasets: [{ data: slices.map((s) => s.revenue), backgroundColor: PALETTE, borderWidth: 0 }]
		};
	}

	onMount(() => {
		const C = ensureChart();
		chart = new C(canvas!, {
			type: 'doughnut',
			data: chartData(),
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { position: 'bottom' } }
			}
		});
	});

	$effect(() => {
		if (chart) {
			chart.data = chartData();
			chart.update();
		}
	});

	onDestroy(() => chart?.destroy());
</script>

<div class="h-56" data-testid="donut-chart"><canvas bind:this={canvas}></canvas></div>
