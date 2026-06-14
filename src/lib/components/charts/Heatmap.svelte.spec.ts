import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Heatmap from './Heatmap.svelte';

describe('Heatmap.svelte', () => {
	it('renders cells across the 7x24 grid', async () => {
		render(Heatmap, { cells: [{ dow: 1, hour: 9, revenue: 500, orders: 5 }] });
		await expect.element(page.getByTestId('cell-1-9')).toBeInTheDocument();
		await expect.element(page.getByTestId('cell-6-23')).toBeInTheDocument();
	});
});
