export type Preset = 'today' | '7d' | '30d' | '90d';
export interface Range {
	from: string; // inclusive ISO yyyy-mm-dd (shop-local)
	to: string; // inclusive ISO yyyy-mm-dd
}

const PRESET_DAYS: Record<Preset, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };

function isoDay(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function presetRange(preset: Preset, today: Date): Range {
	const to = isoDay(today);
	const from = new Date(today);
	from.setDate(from.getDate() - PRESET_DAYS[preset]);
	return { from: isoDay(from), to };
}
