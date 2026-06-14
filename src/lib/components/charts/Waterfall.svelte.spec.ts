import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Waterfall from './Waterfall.svelte';

describe('Waterfall.svelte', () => {
	it('shows gross and net values', async () => {
		render(Waterfall, { gross: 1518, discount: 0, net: 1518, subsidy: 0 });
		await expect.element(page.getByTestId('wf-gross')).toHaveTextContent('฿1,518.00');
		await expect.element(page.getByTestId('wf-net')).toHaveTextContent('฿1,518.00');
	});
	it('hides the subsidy row when zero', async () => {
		render(Waterfall, { gross: 100, discount: 0, net: 100, subsidy: 0 });
		await expect.element(page.getByText('+ Subsidy')).not.toBeInTheDocument();
	});
});
