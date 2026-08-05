export type Preset = 'today' | '7d' | '30d' | '90d';
export interface Range {
	from: string; // inclusive ISO yyyy-mm-dd (shop-local)
	to: string; // inclusive ISO yyyy-mm-dd
}

/**
 * Mirrors maxRangeDays in ../mulan/internal/dashboard/http/handler.go and
 * ../mulan/internal/report/http/handler.go — both 92. Both compare an
 * exclusive end (`to + 24h`) against `from`, so 92 inclusive days is the
 * widest window either accepts; 93 gets a 400.
 */
export const MAX_RANGE_DAYS = 92;

const PRESET_DAYS: Record<Preset, number> = { today: 0, '7d': 6, '30d': 29, '90d': 89 };

/** Shop-local calendar day as ISO yyyy-mm-dd (never UTC — toISOString would shift). */
export function isoDay(d: Date): string {
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

/**
 * Validates a user-entered custom range. Returns null — meaning "don't
 * fetch" — when either date is blank, the order is reversed, or the
 * inclusive span exceeds what the backend accepts. ISO yyyy-mm-dd strings
 * order correctly under plain string comparison.
 */
export function customRange(from: string, to: string): Range | null {
	if (!from || !to) return null;
	if (from > to) return null;
	const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
	if (Number.isNaN(days)) return null;
	if (days > MAX_RANGE_DAYS) return null;
	return { from, to };
}
