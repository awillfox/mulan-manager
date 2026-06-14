export function deltaPct(curr: number, prev: number): number | null {
	if (!prev) return null;
	return ((curr - prev) / prev) * 100;
}

export function deltaLabel(pct: number | null): string {
	if (pct === null || !Number.isFinite(pct)) return 'no prior';
	const arrow = pct >= 0 ? '▲' : '▼';
	return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}
