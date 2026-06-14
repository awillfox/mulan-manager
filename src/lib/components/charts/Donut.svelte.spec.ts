import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Donut from './Donut.svelte';

describe('Donut.svelte', () => {
	it('mounts with data without throwing', async () => {
		render(Donut, {
			items: [
				{ name: 'Latte', qty_sold: 10, revenue: 1000 },
				{ name: 'Mocha', qty_sold: 5, revenue: 500 }
			]
		});
		await expect.element(page.getByTestId('donut-chart')).toBeInTheDocument();
	});
	it('mounts with empty data without throwing', async () => {
		render(Donut, { items: [] });
		await expect.element(page.getByTestId('donut-chart')).toBeInTheDocument();
	});
});
