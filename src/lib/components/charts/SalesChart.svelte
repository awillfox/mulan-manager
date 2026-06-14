<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Chart } from 'chart.js';
	import { ensureChart, PALETTE } from '$lib/charts/chartTheme';
	import type { DayPoint } from '$lib/dashboard/types';

	let { points }: { points: DayPoint[] } = $props();
	let canvas = $state<HTMLCanvasElement>();
	let chart: Chart | undefined;

	function chartData() {
		return {
			labels: points.map((p) => p.day.slice(5)),
			datasets: [
				{
					label: 'Revenue',
					data: points.map((p) => p.revenue),
					borderColor: PALETTE[0],
					backgroundColor: 'rgba(10,132,255,0.12)',
					fill: true,
					tension: 0.3,
					pointRadius: 2
				}
			]
		};
	}

	onMount(() => {
		const C = ensureChart();
		chart = new C(canvas!, {
			type: 'line',
			data: chartData(),
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: { y: { beginAtZero: true } }
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

<div class="h-48" data-testid="sales-chart"><canvas bind:this={canvas}></canvas></div>
