import { describe, it, expect } from 'vitest';
import { topNWithOther } from './donutData';

const items = [
	{ name: 'A', qty_sold: 1, revenue: 100 },
	{ name: 'B', qty_sold: 1, revenue: 80 },
	{ name: 'C', qty_sold: 1, revenue: 50 },
	{ name: 'D', qty_sold: 1, revenue: 20 }
];

describe('topNWithOther', () => {
	it('keeps top n and buckets the rest as Other', () => {
		expect(topNWithOther(items, 2)).toEqual([
			{ name: 'A', revenue: 100 },
			{ name: 'B', revenue: 80 },
			{ name: 'Other', revenue: 70 }
		]);
	});
	it('omits Other when everything fits', () => {
		expect(topNWithOther(items, 10)).toHaveLength(4);
	});
});
