import type { TopMenu } from '$lib/dashboard/types';

export interface Slice {
	name: string;
	revenue: number;
}

export function topNWithOther(items: TopMenu[], n: number): Slice[] {
	const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
	const head: Slice[] = sorted.slice(0, n).map((m) => ({ name: m.name, revenue: m.revenue }));
	const rest = sorted.slice(n);
	if (rest.length) {
		head.push({ name: 'Other', revenue: rest.reduce((s, m) => s + m.revenue, 0) });
	}
	return head;
}
