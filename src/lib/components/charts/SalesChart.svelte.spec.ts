import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SalesChart from './SalesChart.svelte';

describe('SalesChart.svelte', () => {
	it('mounts with data without throwing', async () => {
		render(SalesChart, {
			points: [
				{ day: '2026-06-13', revenue: 430, orders: 5, items: 5 },
				{ day: '2026-06-14', revenue: 1518, orders: 15, items: 20 }
			]
		});
		await expect.element(page.getByTestId('sales-chart')).toBeInTheDocument();
	});
	it('mounts with empty data without throwing', async () => {
		render(SalesChart, { points: [] });
		await expect.element(page.getByTestId('sales-chart')).toBeInTheDocument();
	});
});
